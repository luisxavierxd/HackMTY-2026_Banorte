/**
 * Proveedor Gemini — Google AI Studio (Gemini Developer API) sobre `fetch`.
 *
 * Puerto de `providers/gemini.py`. Absorbe las mismas particularidades que el
 * Python para que el ciclo no las vea:
 *   - "assistant" se llama "model";
 *   - los resultados de herramienta van como `functionResponse` en un turno
 *     de rol "user";
 *   - el esquema de parámetros es un subconjunto de OpenAPI, no JSON Schema
 *     completo -> `sanitizeSchema` (puerto de mcpx/adapter.py);
 *   - JSON estricto se pide con `responseMimeType`.
 */
import type {
  CompleteRequest,
  Completion,
  Message,
  ProviderAdapter,
  ToolCall,
  ToolSpec,
} from "./types";
import { ProviderAuthError, ProviderRequestError } from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const GEMINI_MODEL = "gemini-2.5-flash";

// ── sanitizador de esquema (puerto de mcpx/adapter.py) ───────────────────

const ALLOWED = new Set([
  "type", "format", "description", "nullable", "enum",
  "properties", "required", "items", "minimum", "maximum",
]);

const TYPE_MAP: Record<string, string> = {
  string: "STRING", number: "NUMBER", integer: "INTEGER",
  boolean: "BOOLEAN", array: "ARRAY", object: "OBJECT",
};

type Schema = Record<string, unknown>;

export function sanitizeSchema(node: unknown, defs?: Schema): Schema {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return { type: "STRING" };
  }
  let current = node as Schema;
  const definitions =
    defs ?? (current.$defs as Schema) ?? (current.definitions as Schema) ?? {};

  if ("$ref" in current) {
    const key = String(current.$ref).split("/").pop() ?? "";
    const resolved = (definitions[key] as Schema) ?? {};
    const rest = Object.fromEntries(
      Object.entries(current).filter(([k]) => k !== "$ref")
    );
    current = { ...resolved, ...rest };
  }

  // anyOf/oneOf/allOf: la primera rama no-null (patrón Optional[X] de pydantic)
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const variants = current[key];
    if (Array.isArray(variants)) {
      const branches = variants.filter(
        (b) => (b as Schema)?.type !== "null"
      );
      const merged: Schema = branches.length
        ? sanitizeSchema(branches[0], definitions)
        : { type: "STRING" };
      if (current.description) merged.description = current.description;
      merged.nullable = branches.length !== variants.length;
      return merged;
    }
  }

  const out: Schema = {};
  for (const [key, value] of Object.entries(current)) {
    if (!ALLOWED.has(key)) continue;
    if (key === "type") {
      const t = Array.isArray(value) ? value[0] : value;
      out.type = TYPE_MAP[String(t)] ?? "STRING";
    } else if (key === "properties" && typeof value === "object" && value) {
      out.properties = Object.fromEntries(
        Object.entries(value as Schema).map(([k, v]) => [k, sanitizeSchema(v, definitions)])
      );
    } else if (key === "items") {
      out.items = sanitizeSchema(value, definitions);
    } else {
      out[key] = value;
    }
  }

  if (out.type === "OBJECT" && !out.properties) {
    // Gemini rechaza OBJECT sin properties.
    out.properties = { value: { type: "STRING" } };
  }
  if (!out.type) out.type = "properties" in out ? "OBJECT" : "STRING";
  return out;
}

// ── traducción neutral -> nativo ─────────────────────────────────────────

function toContents(messages: Message[]): Record<string, unknown>[] {
  const contents: Record<string, unknown>[] = [];
  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";
    const parts: Record<string, unknown>[] = [];
    for (const block of msg.content ?? []) {
      if (block.type === "text" && block.text) {
        parts.push({ text: block.text });
      } else if (block.type === "tool_call") {
        parts.push({ functionCall: { name: block.name, args: block.args ?? {} } });
      } else if (block.type === "tool_result") {
        parts.push({
          functionResponse: { name: block.name, response: block.result ?? {} },
        });
      }
    }
    if (parts.length) {
      // los functionResponse deben ir en un turno de usuario
      const isResult = parts.some((p) => "functionResponse" in p);
      contents.push({ role: isResult ? "user" : role, parts });
    }
  }
  return contents;
}

function toTools(tools: ToolSpec[]): Record<string, unknown>[] {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: (t.description || "").slice(0, 1024),
        parameters: sanitizeSchema(t.schema),
      })),
    },
  ];
}

export class GeminiAdapter implements ProviderAdapter {
  readonly id = "gemini" as const;
  readonly label = "Gemini";
  readonly model = GEMINI_MODEL;
  readonly nativeTools = true;

  readonly #apiKey: string;

  constructor(apiKey: string) {
    this.#apiKey = apiKey;
  }

  async complete(req: CompleteRequest): Promise<Completion> {
    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature ?? 0.2,
    };
    if (req.maxOutputTokens) generationConfig.maxOutputTokens = req.maxOutputTokens;
    if (req.jsonMode) generationConfig.responseMimeType = "application/json";

    const body: Record<string, unknown> = {
      contents: toContents(req.messages),
      systemInstruction: { parts: [{ text: req.system }] },
      generationConfig,
    };
    if (req.tools?.length) body.tools = toTools(req.tools);

    const resp = await fetch(`${API_BASE}/${this.model}:generateContent`, {
      method: "POST",
      signal: req.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.#apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      const message = extractErrorMessage(detail) || `HTTP ${resp.status}`;
      if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
        // Gemini devuelve 400 con API_KEY_INVALID cuando la key está mal.
        if (/api.?key|credential|permission/i.test(message) || resp.status !== 400) {
          throw new ProviderAuthError(`Gemini rechazó la API key: ${message}`);
        }
      }
      throw new ProviderRequestError(`Gemini falló: ${message}`, resp.status);
    }

    const data = (await resp.json()) as {
      candidates?: { content?: { parts?: Record<string, unknown>[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const calls: ToolCall[] = [];
    const textParts: string[] = [];
    for (const part of parts) {
      const fc = part.functionCall as
        | { name?: string; args?: Record<string, unknown>; id?: string }
        | undefined;
      if (fc?.name) {
        calls.push({
          id: fc.id ?? crypto.randomUUID().slice(0, 8),
          name: fc.name,
          args: { ...(fc.args ?? {}) },
        });
      } else if (typeof part.text === "string") {
        textParts.push(part.text);
      }
    }

    return {
      // igual que el Python: si hubo tool calls, el texto no se usa
      text: calls.length ? "" : textParts.join(""),
      toolCalls: calls,
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      provider: this.id,
      model: this.model,
    };
  }
}

function extractErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed?.error?.message ?? "";
  } catch {
    return raw.slice(0, 200);
  }
}
