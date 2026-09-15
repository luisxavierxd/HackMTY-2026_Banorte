/**
 * El ciclo del agente, corriendo entero en el navegador.
 *
 * Puerto de `agent/loop.py`: N pasos de razonamiento con herramientas, luego
 * composición de UI con un intento de reparación usando los errores del
 * validador, y fallback garantizado. La frontera del harness se conserva —
 * **el modelo decide qué herramienta llamar, este ciclo la ejecuta** — solo
 * que ahora las herramientas son funciones puras en TS (`agent/tools/`) en
 * vez de un servidor MCP por stdio.
 *
 * Emite exactamente los eventos del harness (`contract/events.ts`). Si no
 * puede producir alguno, lo omite; nunca inventa uno nuevo.
 */
import type { ActionMessage } from "../contract/events";
import type { EngineStatus, HarnessEvent, TurnEngine, TurnOptions } from "./types";
import type { Completion, Message, ProviderAdapter, ToolCall, ToolSpec } from "../provider/types";
import { textMsg } from "../provider/types";
import { loadCatalog, type CatalogDocument } from "../agent/catalog";
import { compilePlan, fallbackPlan, type CompileResult, type UiPlan } from "../agent/composer";
import {
  actionToPrompt,
  loadPrompts,
  reasoningSystemPrompt,
  toolManifestPrompt,
  uiSystemPrompt,
  type PromptTemplates,
} from "../agent/prompts";
import { TOOLS, runTool } from "../agent/tools";
import { getProfile } from "../net/profile";

// Mismos presupuestos que el harness (config.py). Protegen la demo.
const MAX_TOOL_STEPS = 6;
const MAX_COMPONENTS = 24;
const MAX_TRACE_ITEMS = 8;
const TEMPERATURE = 0.2;
const UI_TEMPERATURE = 0.4;
const SURFACE_ID = "main";
const DOMAIN = "educacion_financiera";

interface TraceItem {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

/** Una cancelación nunca se traga: se re-lanza para que el turno muera de verdad. */
function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("turno cancelado");
    err.name = "AbortError";
    throw err;
  }
}

/** Tolera ```json, preámbulos y texto suelto alrededor del objeto. */
export function extractJson(text: string): Record<string, unknown> {
  let body = (text || "").trim();
  if (body.startsWith("```")) {
    const parts = body.split("```");
    body = parts.length > 1 ? parts[1] : body;
    const nl = body.indexOf("\n");
    if (nl !== -1) body = body.slice(nl + 1);
  }
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("la respuesta no contiene JSON");
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
}

function isUiPlan(payload: Record<string, unknown>): boolean {
  return Boolean(payload.components || payload.root);
}

/** Interpreta la respuesta de un proveedor sin function calling nativo. */
export function parsePromptedCalls(text: string): [ToolCall[], string] {
  let payload: Record<string, unknown>;
  try {
    payload = extractJson(text);
  } catch {
    return [[], (text || "").trim()];
  }
  if (Array.isArray(payload.tool_calls)) {
    const calls = (payload.tool_calls as Record<string, unknown>[])
      .filter((item) => item?.name)
      .map((item) => ({
        id: crypto.randomUUID().slice(0, 8),
        name: String(item.name),
        args: (item.args ?? item.arguments ?? {}) as Record<string, unknown>,
      }));
    if (calls.length) return [calls, ""];
  }
  if (isUiPlan(payload)) {
    console.warn("[agent] el reasoner generó un plan de UI en vez de tool_calls — descartado");
    return [[], String(payload.summary ?? "Hubo un error, intenta de nuevo.")];
  }
  return [[], String(payload.final ?? payload.text ?? text).trim()];
}

export class BrowserAgentEngine implements TurnEngine {
  readonly id = "browser" as const;

  readonly #provider: ProviderAdapter | null;
  #history: Message[] = [];
  #dataModel: Record<string, unknown> = {};
  #rendered = false;

  constructor(provider: ProviderAdapter | null) {
    this.#provider = provider;
  }

  get label(): string {
    return this.#provider?.label ?? "Navegador";
  }

  get model(): string {
    return this.#provider?.model ?? "";
  }

  status(): EngineStatus {
    return this.#provider ? "ready" : "needs-credential";
  }

  async reset(): Promise<void> {
    this.#history = [];
    this.#dataModel = {};
    this.#rendered = false;
  }

  send(text: string, options?: TurnOptions): AsyncIterable<HarnessEvent> {
    return this.#runTurn(text, options);
  }

  async *act(action: ActionMessage, options?: TurnOptions): AsyncIterable<HarnessEvent> {
    // el cliente puede reportar cambios del data model (sendDataModel=true)
    for (const [path, value] of Object.entries(action.dataModel ?? {})) {
      if (path === "/" && value && typeof value === "object") {
        this.#dataModel = { ...(value as Record<string, unknown>) };
      } else {
        this.#dataModel[path] = value;
      }
    }
    yield { type: "ack", action: action.name };
    const prompt = actionToPrompt(action.name, action.params ?? {}, this.#dataModel);
    yield* this.#runTurn(prompt, options);
  }

  // ------------------------------------------------------------------ //
  async *#runTurn(userText: string, options?: TurnOptions): AsyncIterable<HarnessEvent> {
    const provider = this.#provider;
    if (!provider) {
      yield { type: "error", message: "Falta la API key del proveedor." };
      return;
    }
    const signal = options?.signal;
    const t0 = performance.now();

    let catalog: CatalogDocument;
    let prompts: PromptTemplates;
    try {
      // Los dos son artefactos de `make contract`: si falta uno, el build del
      // sitio quedó incompleto y es mejor decirlo que producir una pantalla rara.
      [catalog, prompts] = await Promise.all([loadCatalog(), loadPrompts(signal)]);
    } catch (err) {
      yield { type: "error", message: `No se pudo leer el contrato: ${asMessage(err)}` };
      return;
    }

    const profile = getProfile() as Record<string, unknown> | null;
    this.#history.push(textMsg("user", userText));

    const specs = this.#toolSpecs();
    const native = provider.nativeTools;
    let system = reasoningSystemPrompt(prompts, DOMAIN, profile);
    if (!native) system += toolManifestPrompt(prompts, specs);

    const trace: TraceItem[] = [];
    let finalText = "";
    let usage: Record<string, unknown> = {};

    try {
      for (let step = 0; step < MAX_TOOL_STEPS; step++) {
        throwIfAborted(signal);
        const completion: Completion = await provider.complete({
          system,
          messages: this.#history,
          tools: native ? specs : undefined,
          jsonMode: !native,
          temperature: TEMPERATURE,
          signal,
        });
        usage = Object.keys(completion.usage ?? {}).length ? completion.usage : usage;

        let calls: ToolCall[];
        if (native) {
          calls = completion.toolCalls;
          finalText = completion.text;
        } else {
          [calls, finalText] = parsePromptedCalls(completion.text);
        }

        if (!calls.length) {
          if (finalText) this.#history.push(textMsg("assistant", finalText));
          break;
        }

        this.#history.push({
          role: "assistant",
          content: calls.map((c) => ({
            type: "tool_call" as const,
            id: c.id,
            name: c.name,
            args: c.args,
          })),
        });

        const results: Message["content"] = [];
        for (const call of calls) {
          throwIfAborted(signal);
          yield { type: "tool_call", name: call.name, args: call.args, step };
          const result = await this.#callTool(call.name, call.args);
          trace.push({ tool: call.name, args: call.args, result });
          yield { type: "tool_result", name: call.name, ok: !("error" in result) };
          results.push({ type: "tool_result", id: call.id, name: call.name, result });
        }
        this.#history.push({ role: "user", content: results });
      }

      yield { type: "thinking", text: "Diseñando la interfaz…" };

      const [result, plan] = await this.#composeUi(
        userText, finalText, trace, catalog, prompts, profile, signal
      );

      yield {
        type: "surface",
        title: String(plan.title ?? ""),
        summary: String(plan.summary ?? finalText ?? ""),
        a2ui: result.messages as never,
        warnings: result.errors,
      };
      this.#rendered = true;
      // El data model que la UI ve ahora es el del plan — el siguiente `act`
      // debe partir de ahí, no del de la pantalla anterior.
      this.#dataModel = { ...result.data };
      this.#history.push(textMsg("assistant", `[UI generada] ${String(plan.title ?? "")}`));

      yield {
        type: "turn_end",
        latency_ms: Math.round(performance.now() - t0),
        tools_used: trace.map((t) => t.tool),
        provider: provider.id,
        model: provider.model,
        usage,
      };
    } catch (err) {
      if (isAbort(err)) return; // cancelado a propósito: sin evento, sin ruido
      yield { type: "error", message: asMessage(err) };
    }
  }

  // ------------------------------------------------------------------ //
  async #composeUi(
    userText: string,
    agentText: string,
    trace: TraceItem[],
    catalog: CatalogDocument,
    prompts: PromptTemplates,
    profile: Record<string, unknown> | null,
    signal?: AbortSignal
  ): Promise<[CompileResult, UiPlan]> {
    const provider = this.#provider!;

    // Los resultados de las tools se auto-inyectan al data model para que la
    // UI los referencie por ruta en vez de copiar series número por número.
    const auto: Record<string, unknown> = {};
    for (const item of trace) {
      let short = item.tool.split("__").pop() ?? item.tool;
      if (short in auto) {
        const n = Object.keys(auto).filter((k) => k.startsWith(short)).length + 1;
        short = `${short}_${n}`;
      }
      auto[short] = item.result;
    }

    const brief = {
      intencion_usuario: userText,
      lectura_del_agente: agentText,
      datos_disponibles: trace.slice(-MAX_TRACE_ITEMS),
      estado_actual_de_la_pantalla: this.#dataModel ?? {},
      perfil_usuario: profile ?? {},
    };
    const messages: Message[] = [textMsg("user", JSON.stringify(brief))];
    const system = uiSystemPrompt(prompts, MAX_COMPONENTS);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        throwIfAborted(signal);
        const completion = await provider.complete({
          system,
          messages,
          jsonMode: true,
          temperature: UI_TEMPERATURE,
          signal,
        });
        const plan = extractJson(completion.text) as UiPlan;
        // /datos/<tool> siempre son los resultados REALES: si el modelo
        // redeclara su propia "datos", la real gana sin importar el orden.
        const planData = (plan.data ?? {}) as Record<string, unknown>;
        planData.datos = auto;
        plan.data = planData;

        const result = compilePlan(plan, SURFACE_ID, !this.#rendered, catalog);
        if (result.ok) return [result, plan];

        messages.push(textMsg("assistant", completion.text));
        messages.push(
          textMsg(
            "user",
            "El plan fue rechazado por el validador:\n" +
              result.errors.slice(0, 10).join("\n") +
              "\nCorrígelo y devuelve solo el JSON."
          )
        );
      } catch (err) {
        if (isAbort(err)) throw err;
        console.warn(`[agent] composición de UI falló (intento ${attempt + 1}):`, asMessage(err));
      }
    }

    const plan = fallbackPlan(
      "No pude armar esa pantalla",
      agentText || "Intenta reformular lo que necesitas."
    );
    return [compilePlan(plan, SURFACE_ID, !this.#rendered, catalog), plan];
  }

  #toolSpecs(): ToolSpec[] {
    return TOOLS.map((t) => ({
      name: t.qualified,
      description: t.description,
      schema: t.schema,
    }));
  }

  /** Igual que `mcp.call`: un fallo de tool es un resultado, no una excepción. */
  async #callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      return await runTool(name, args);
    } catch (err) {
      if (isAbort(err)) throw err;
      return { error: asMessage(err) };
    }
  }
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
