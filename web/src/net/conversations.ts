import type { SurfaceState } from "../a2ui/surfaceReducer";

export interface TranscriptEntry {
  /** `divider` marca un cambio de proveedor a media conversación (§6 de la
   *  spec): el historial NO se borra, se anota — la traza tiene que seguir
   *  siendo legible. No es un mensaje de nadie, así que no se manda al modelo. */
  role: "user" | "agent" | "divider";
  text: string;
  ts: number;
  surface?: SurfaceState;
  title?: string;
}

export interface ConversationRecord {
  id: string;
  title: string;
  updatedAt: number;
  transcript: TranscriptEntry[];
  lastSurface: SurfaceState;
  lastTitle: string;
}

/** Índice de conversaciones por navegador (localStorage, no backend — ver
 *  docs/superpowers/specs/2026-09-12-landing-liquid-glass-design.md). El
 *  `id` de cada registro es el mismo `session_id` que ya vive en la cookie
 *  `bn-session-id` (net/useSocket.ts), solo que ahora puede haber varios. */
const INDEX_KEY = "bn-conversations";

function readIndex(): ConversationRecord[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(list: ConversationRecord[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    // localStorage lleno o deshabilitado (modo privado): la demo sigue
    // funcionando, solo sin historial persistente entre recargas.
  }
}

export function listConversations(): ConversationRecord[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): ConversationRecord | undefined {
  return readIndex().find((c) => c.id === id);
}

export function upsertConversation(record: ConversationRecord): void {
  const list = readIndex();
  const i = list.findIndex((c) => c.id === record.id);
  if (i >= 0) list[i] = record;
  else list.push(record);
  writeIndex(list);
}

/** Devuelve el registro existente o crea uno vacío — así toda conversación
 *  activa aparece en la lista del sidebar aunque no tenga mensajes todavía. */
export function ensureConversation(id: string): ConversationRecord {
  const existing = getConversation(id);
  if (existing) return existing;
  const fresh: ConversationRecord = {
    id,
    title: "",
    updatedAt: Date.now(),
    transcript: [],
    lastSurface: null,
    lastTitle: "",
  };
  upsertConversation(fresh);
  return fresh;
}

export function removeConversation(id: string): void {
  writeIndex(readIndex().filter((c) => c.id !== id));
}

export function clearConversations(): void {
  try {
    localStorage.removeItem(INDEX_KEY);
  } catch {
    // ver writeIndex
  }
}

export function deriveTitle(firstUserText: string): string {
  const trimmed = firstUserText.trim();
  if (!trimmed) return "Nueva conversación";
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
}

export function relativeDate(ts: number): string {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `hace ${diffDay} d`;
  return new Date(ts).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
