/**
 * Tipos neutrales de proveedor — puerto directo de `providers/base.py` del
 * harness Python (ver legacy/src/harness/providers/base.py).
 *
 * El ciclo del agente en el navegador habla ESTOS tipos. Cada adaptador
 * traduce a su API nativa y de regreso. Mantener la misma forma que el
 * Python es lo que permite comparar las dos implementaciones y lo que hace
 * que los goldens del §3 de la spec tengan sentido.
 */

export type ProviderId = "anthropic" | "gemini";

/** Herramienta en JSON Schema crudo. Cada proveedor la adapta a su formato. */
export interface ToolSpec {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Completion {
  text: string;
  toolCalls: ToolCall[];
  usage: Record<string, unknown>;
  provider: string;
  model: string;
}

// Mensaje neutral: {role: "user" | "assistant", content: Block[]}
export type Block =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result: unknown };

export interface Message {
  role: "user" | "assistant";
  content: Block[];
}

export function textMsg(role: Message["role"], text: string): Message {
  return { role, content: [{ type: "text", text }] };
}

export interface CompleteRequest {
  system: string;
  messages: Message[];
  tools?: ToolSpec[];
  /** Pide salida JSON. Los proveedores sin modo nativo lo piden en el prompt. */
  jsonMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

/** Contrato mínimo, igual que `LLMProvider` en Python: una sola operación. */
export interface ProviderAdapter {
  readonly id: ProviderId;
  /** Nombre visible, para el chip del sidebar. */
  readonly label: string;
  readonly model: string;
  /** `false` -> el ciclo usa tool calling por prompt en vez de nativo. */
  readonly nativeTools: boolean;

  complete(req: CompleteRequest): Promise<Completion>;
}

/** La key es inválida o le falta permiso — hay que volver a pedirla. */
export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

/** Falló la red o el proveedor devolvió 5xx / rate limit. */
export class ProviderRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}
