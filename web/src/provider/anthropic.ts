/**
 * Proveedor Anthropic — Messages API, llamada directo desde el navegador.
 *
 * Puerto de `providers/anthropic_api.py` sobre `fetch` en vez del SDK: meter
 * el SDK de Node a un bundle de navegador no vale la pena para una sola
 * llamada, y así el bundle no crece.
 *
 * La key vive solo en memoria de este objeto y solo sale en el header de la
 * petición. Nunca se loguea ni viaja a ningún otro lado.
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

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const ANTHROPIC_MODEL = "claude-sonnet-4-6";

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function toMessages(messages: Message[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const msg of messages) {
    const content: Record<string, unknown>[] = [];
    for (const block of msg.content ?? []) {
      if (block.type === "text" && block.text) {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "tool_call") {
        content.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.args ?? {},
        });
      } else if (block.type === "tool_result") {
        content.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(block.result ?? {}),
        });
      }
    }
    if (!content.length) continue;
    // los tool_result deben ir en un mensaje de rol "user"
    const hasResult = content.some((b) => b.type === "tool_result");
    out.push({ role: hasResult ? "user" : msg.role, content });
  }
  return out;
}

function toTools(tools: ToolSpec[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    name: t.name,
    description: (t.description || "").slice(0, 1024),
    input_schema: t.schema && Object.keys(t.schema).length
      ? t.schema
      : { type: "object", properties: {} },
  }));
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic";
  readonly model = ANTHROPIC_MODEL;
  readonly nativeTools = true;

  readonly #apiKey: string;
  readonly #maxTokens: number;

  constructor(apiKey: string, maxTokens = 4096) {
    this.#apiKey = apiKey;
    this.#maxTokens = maxTokens;
  }

  async complete(req: CompleteRequest): Promise<Completion> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxOutputTokens ?? this.#maxTokens,
      system: req.system,
      messages: toMessages(req.messages),
      temperature: req.temperature ?? 0.2,
    };
    if (req.tools?.length) body.tools = toTools(req.tools);

    const resp = await fetch(API_URL, {
      method: "POST",
      signal: req.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.#apiKey,
        "anthropic-version": API_VERSION,
        // Sin este header el preflight CORS falla y la llamada nunca sale
        // del navegador (§7 de la spec).
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      // El cuerpo del error puede traer eco de la petición; se usa solo el
      // mensaje, nunca se reenvía a ningún lado.
      const detail = await resp.text().catch(() => "");
      const message = extractErrorMessage(detail) || `HTTP ${resp.status}`;
      if (resp.status === 401 || resp.status === 403) {
        throw new ProviderAuthError(`Anthropic rechazó la API key: ${message}`);
      }
      throw new ProviderRequestError(`Anthropic falló: ${message}`, resp.status);
    }

    const data = (await resp.json()) as {
      content?: AnthropicBlock[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const textParts: string[] = [];
    const calls: ToolCall[] = [];
    for (const block of data.content ?? []) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        calls.push({
          id: block.id ?? crypto.randomUUID().slice(0, 8),
          name: block.name ?? "",
          args: { ...(block.input ?? {}) },
        });
      }
    }

    return {
      text: textParts.join(""),
      toolCalls: calls,
      usage: {
        input_tokens: data.usage?.input_tokens ?? 0,
        output_tokens: data.usage?.output_tokens ?? 0,
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
