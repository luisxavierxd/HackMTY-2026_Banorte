/**
 * Formato de las sesiones grabadas que reproduce `RecordedEngine`.
 *
 * Este archivo es el CONTRATO con `scripts/record_session.py`: el script de
 * Python corre un turno real contra el harness, cronometra los eventos y
 * escribe exactamente esta forma en `web/public/recorded/`. Si cambias algo
 * aquí, cambia el script — son las dos mitades de la misma pieza.
 *
 * Por qué grabar en vez de simular: las respuestas son del harness real, con
 * el modelo real y las tools reales. Un visitante sin API key ve la demo
 * verdadera, no un mockup escrito a mano.
 */
import type { HarnessEvent } from "./types";

/** Sube cuando la forma cambie de manera incompatible. */
export const RECORDED_FORMAT_VERSION = 1;

/** Tope entre eventos: respeta el ritmo grabado sin que se sienta lento. */
export const MAX_DELTA_MS = 1500;

/** Un evento del harness más cuánto tardó en llegar después del anterior. */
export interface RecordedEvent {
  /** Milisegundos desde el evento previo. El primero suele ser 0. */
  deltaMs: number;
  event: HarnessEvent;
}

/** Qué produjo la grabación: un mensaje escrito o un clic en la UI. */
export type RecordedKind = "message" | "action";

/** Un archivo `web/public/recorded/<id>.json`. */
export interface RecordedSession {
  /** Identificador estable, normalmente el nombre del archivo sin extensión. */
  id: string;
  /** Texto del usuario que produjo el turno. Es la llave para hacer match. */
  prompt: string;
  /** Etiqueta legible para la UI (el título de la surface resultante). */
  title: string;
  kind: RecordedKind;
  /** Nombre de la acción, solo cuando `kind === "action"`. */
  action?: string;
  /** Proveedor y modelo con los que se grabó — se muestran en la traza. */
  provider?: string;
  model?: string;
  /** ISO-8601 de cuándo se grabó, para saber qué tan vieja está. */
  recordedAt?: string;
  events: RecordedEvent[];
}

/**
 * Entrada del índice. Trae los campos de match (`prompt`, `action`) para que
 * el motor pueda elegir la sesión correcta SIN bajar los archivos completos:
 * se descarga solo la que gana. Con pocas sesiones da igual, pero mantiene el
 * primer render barato si algún día son muchas.
 */
export interface RecordedIndexEntry {
  /** Nombre del archivo dentro de `recorded/`, ej. `"interes_compuesto.json"`. */
  file: string;
  id: string;
  prompt: string;
  title: string;
  kind: RecordedKind;
  action?: string;
}

/** `web/public/recorded/index.json`. */
export interface RecordedIndex {
  version: number;
  sessions: RecordedIndexEntry[];
}

// --------------------------------------------------------------------------
// Validación defensiva: los JSON son artefactos generados y pueden venir de
// un build viejo. Nada de esto debe tronar el render — si algo no cuadra, se
// descarta esa entrada y la demo sigue.
// --------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isRecordedEvent(v: unknown): v is RecordedEvent {
  if (!isObject(v)) return false;
  const ev = v.event;
  return isObject(ev) && typeof ev.type === "string";
}

export function parseRecordedSession(raw: unknown, fallbackId: string): RecordedSession | null {
  if (!isObject(raw)) return null;
  const events = Array.isArray(raw.events) ? raw.events.filter(isRecordedEvent) : [];
  if (events.length === 0) return null;
  const kind: RecordedKind = raw.kind === "action" ? "action" : "message";
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : fallbackId,
    prompt: typeof raw.prompt === "string" ? raw.prompt : "",
    title: typeof raw.title === "string" ? raw.title : "",
    kind,
    action: typeof raw.action === "string" ? raw.action : undefined,
    provider: typeof raw.provider === "string" ? raw.provider : undefined,
    model: typeof raw.model === "string" ? raw.model : undefined,
    recordedAt: typeof raw.recordedAt === "string" ? raw.recordedAt : undefined,
    events,
  };
}

export function parseRecordedIndex(raw: unknown): RecordedIndex | null {
  if (!isObject(raw) || !Array.isArray(raw.sessions)) return null;
  const sessions: RecordedIndexEntry[] = [];
  for (const item of raw.sessions) {
    if (!isObject(item) || typeof item.file !== "string" || !item.file) continue;
    sessions.push({
      file: item.file,
      id: typeof item.id === "string" && item.id ? item.id : item.file.replace(/\.json$/i, ""),
      prompt: typeof item.prompt === "string" ? item.prompt : "",
      title: typeof item.title === "string" ? item.title : "",
      kind: item.kind === "action" ? "action" : "message",
      action: typeof item.action === "string" ? item.action : undefined,
    });
  }
  if (sessions.length === 0) return null;
  return {
    version: typeof raw.version === "number" ? raw.version : RECORDED_FORMAT_VERSION,
    sessions,
  };
}
