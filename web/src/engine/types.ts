/**
 * La costura que sostiene los tres modos de la demo.
 *
 * Toda la UI habla con `TurnEngine` y nada más. `recorded`, `browser` y
 * `remote` son implementaciones intercambiables; meter Pyodide después es
 * agregar una cuarta sin tocar una línea de UI.
 *
 * Los eventos que emiten son EXACTAMENTE los del harness real
 * (`contract/events.ts`). Si un motor no puede producir alguno, lo omite —
 * nunca inventa un tipo nuevo ni extiende el existente.
 */
import type { ActionMessage, ServerEvent } from "../contract/events";

/** Alias del contrato del harness. Un motor emite un subconjunto de esto. */
export type HarnessEvent = ServerEvent;

export type EngineId = "recorded" | "browser" | "remote";

/**
 * - `ready`            listo para correr un turno
 * - `needs-credential` falta la API key / el código de acceso
 * - `unreachable`      hay credencial pero el otro lado no responde
 */
export type EngineStatus = "ready" | "needs-credential" | "unreachable";

/** El turno en vuelo se cancela con `signal` — nunca se deja huérfano. */
export interface TurnOptions {
  signal?: AbortSignal;
}

export interface TurnEngine {
  readonly id: EngineId;
  /** Nombre visible del proveedor, para el chip del sidebar. */
  readonly label: string;
  /** Modelo activo, o "" si el motor no tiene uno (ej. `recorded`). */
  readonly model: string;

  send(text: string, options?: TurnOptions): AsyncIterable<HarnessEvent>;
  act(action: ActionMessage, options?: TurnOptions): AsyncIterable<HarnessEvent>;
  reset(): Promise<void>;
  status(): EngineStatus;
}

/** Error que un motor lanza cuando no puede seguir y hay que degradar a `recorded`. */
export class EngineUnreachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnreachable";
  }
}
