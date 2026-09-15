/**
 * Motor por defecto y red de seguridad de todos los demás (§4.1 de la spec).
 *
 * Reproduce turnos que el harness REAL ya corrió, grabados con
 * `scripts/record_session.py`. Sin credencial, sin red más allá del CDN: un
 * visitante que llega sin API key ve la demo funcionando en un clic.
 *
 * Regla de oro: este motor NUNCA falla. Si el índice no baja, si un archivo
 * está corrupto, si no hay match — siempre sale algo renderizable. Es lo
 * único que garantiza que la demo no quede en blanco.
 */
import type { ActionMessage } from "../contract/events";
import {
  MAX_DELTA_MS,
  parseRecordedIndex,
  parseRecordedSession,
  type RecordedIndexEntry,
  type RecordedSession,
} from "./recordedFormat";
import type { EngineStatus, HarnessEvent, TurnEngine, TurnOptions } from "./types";

const RECORDED_DIR = "recorded";

/** Une el base de Vite con una ruta relativa. El sitio puede vivir en un
 *  subpath (`/HackMTY-2026_Banorte/`), así que nada de rutas absolutas. */
function assetUrl(relative: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;
}

/** minúsculas, sin acentos, sin puntuación — para comparar textos en español. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras vacías del español: si cuentan, "¿cómo voy con mis ahorros?"
 *  empata con cualquier cosa que traiga "con"/"mis" y el match se vuelve ruido. */
const STOPWORDS = new Set([
  "a", "al", "algo", "como", "con", "cual", "cuanto", "de", "del", "el", "en",
  "es", "esta", "este", "haz", "hazme", "la", "las", "lo", "los", "mas", "me",
  "mi", "mis", "muy", "no", "o", "para", "pero", "por", "que", "quiero", "se",
  "si", "sobre", "su", "sus", "tu", "tus", "un", "una", "uno", "y", "ya",
]);

function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Puntúa qué tan bien empata el texto del usuario con el prompt grabado:
 * proporción de palabras del prompt que aparecen en el texto. Se normaliza
 * por el tamaño del prompt para que una sesión con prompt largo no gane solo
 * por tener más palabras donde caer.
 */
function score(userText: string, entry: RecordedIndexEntry): number {
  const wanted = tokens(entry.prompt);
  if (wanted.length === 0) return 0;
  const got = new Set(tokens(userText));
  let hits = 0;
  for (const w of wanted) if (got.has(w)) hits += 1;
  if (hits === 0) return 0;
  // el título también cuenta, con menos peso: describe el resultado, no la pregunta
  const titleWords = tokens(entry.title);
  let titleHits = 0;
  for (const w of titleWords) if (got.has(w)) titleHits += 1;
  return hits / wanted.length + (titleWords.length ? (titleHits / titleWords.length) * 0.25 : 0);
}

/** Espera respetando el abort. Devuelve false si se canceló. */
function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (ms <= 0) return Promise.resolve(!signal?.aborted);
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve(false);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Sesión mínima embebida. Solo se usa si `recorded/` no existe o está roto
 * (build sin `make contract`, 404 del CDN). Es fea a propósito: dice la
 * verdad en vez de fingir una respuesta.
 */
function fallbackSession(prompt: string): RecordedSession {
  const surfaceId = "main";
  return {
    id: "__fallback__",
    prompt,
    title: "Sesión grabada no disponible",
    kind: "message",
    events: [
      {
        deltaMs: 0,
        event: {
          type: "thinking",
          text: "Buscando la sesión grabada…",
        },
      },
      {
        deltaMs: 400,
        event: {
          type: "surface",
          title: "Sesión grabada no disponible",
          summary:
            "No se encontraron sesiones grabadas en este despliegue. Elige un proveedor con tu propia API key para correr un turno real.",
          a2ui: [
            { createSurface: { surfaceId } },
            {
              updateComponents: {
                surfaceId,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    props: { children: ["aviso", "detalle"], gap: "md" },
                  },
                  {
                    id: "aviso",
                    component: "Callout",
                    props: {
                      text: "Este build no trae sesiones grabadas.",
                      tone: "warning",
                    },
                  },
                  {
                    id: "detalle",
                    component: "Text",
                    props: {
                      text: "Corre `make contract` antes de compilar, o elige Anthropic / Gemini en el selector de proveedor para usar tu propia key.",
                      variant: "body",
                    },
                  },
                ],
              },
            },
          ],
          warnings: ["sin sesiones grabadas"],
        },
      },
      {
        deltaMs: 120,
        event: {
          type: "turn_end",
          latency_ms: 520,
          tools_used: [],
          provider: "recorded",
          model: "",
          usage: {},
        },
      },
    ],
  };
}

export interface RecordedEngineOptions {
  /** Inyectable para tests; por default baja de `recorded/`. */
  fetchImpl?: typeof fetch;
}

export class RecordedEngine implements TurnEngine {
  readonly id = "recorded" as const;
  readonly label = "Sesión grabada";
  readonly model = "";

  private readonly fetchImpl: typeof fetch;
  /** Se cachea la promesa, no el valor: varias llamadas concurrentes al
   *  arrancar no deben disparar tres fetch del mismo índice. */
  private indexPromise: Promise<RecordedIndexEntry[]> | null = null;
  private readonly sessionCache = new Map<string, RecordedSession | null>();
  /** Última sesión reproducida — `act()` la repite si no hay match mejor. */
  private lastSession: RecordedSession | null = null;

  constructor(options: RecordedEngineOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  status(): EngineStatus {
    return "ready";
  }

  async reset(): Promise<void> {
    this.lastSession = null;
  }

  send(text: string, options: TurnOptions = {}): AsyncIterable<HarnessEvent> {
    return this.play(() => this.pickForText(text), text, options);
  }

  act(action: ActionMessage, options: TurnOptions = {}): AsyncIterable<HarnessEvent> {
    const label = action.name.replace(/_/g, " ");
    return this.play(() => this.pickForAction(action), label, options, {
      type: "ack",
      action: action.name,
    });
  }

  // ---------------------------------------------------------------- //

  private async *play(
    pick: () => Promise<RecordedSession>,
    prompt: string,
    options: TurnOptions,
    lead?: HarnessEvent
  ): AsyncIterable<HarnessEvent> {
    const { signal } = options;
    if (signal?.aborted) return;

    if (lead) yield lead;

    let session: RecordedSession;
    try {
      session = await pick();
    } catch {
      session = fallbackSession(prompt);
    }
    if (signal?.aborted) return;
    this.lastSession = session;

    for (const step of session.events) {
      const delay = Math.min(Math.max(step.deltaMs || 0, 0), MAX_DELTA_MS);
      const ok = await sleep(delay, signal);
      // abortado a medio turno: se corta sin lanzar, el abort es esperado
      if (!ok || signal?.aborted) return;
      yield step.event;
    }
  }

  private async pickForText(text: string): Promise<RecordedSession> {
    const entries = await this.loadIndex();
    const candidates = entries.filter((e) => e.kind === "message");
    const pool = candidates.length > 0 ? candidates : entries;
    if (pool.length === 0) return fallbackSession(text);

    let best = pool[0];
    let bestScore = -1;
    for (const entry of pool) {
      const s = score(text, entry);
      if (s > bestScore) {
        bestScore = s;
        best = entry;
      }
    }
    // sin ninguna palabra en común se queda la primera: es el default
    // declarado en la spec, no un error
    return (await this.loadSession(best)) ?? fallbackSession(text);
  }

  private async pickForAction(action: ActionMessage): Promise<RecordedSession> {
    const entries = await this.loadIndex();
    const exact = entries.find((e) => e.kind === "action" && e.action === action.name);
    if (exact) {
      const loaded = await this.loadSession(exact);
      if (loaded) return loaded;
    }
    // sin grabación para esta acción: repetir la última pantalla es más
    // honesto que inventar una nueva, y deja la traza legible
    if (this.lastSession) return this.lastSession;
    return this.pickForText(action.name.replace(/_/g, " "));
  }

  private loadIndex(): Promise<RecordedIndexEntry[]> {
    if (!this.indexPromise) {
      this.indexPromise = this.fetchIndex().catch(() => []);
    }
    return this.indexPromise;
  }

  private async fetchIndex(): Promise<RecordedIndexEntry[]> {
    const res = await this.fetchImpl(assetUrl(`${RECORDED_DIR}/index.json`), {
      cache: "no-cache",
    });
    if (!res.ok) return [];
    const parsed = parseRecordedIndex(await res.json());
    return parsed?.sessions ?? [];
  }

  private async loadSession(entry: RecordedIndexEntry): Promise<RecordedSession | null> {
    const cached = this.sessionCache.get(entry.file);
    if (cached !== undefined) return cached;

    let session: RecordedSession | null = null;
    try {
      const res = await this.fetchImpl(assetUrl(`${RECORDED_DIR}/${entry.file}`), {
        cache: "no-cache",
      });
      if (res.ok) session = parseRecordedSession(await res.json(), entry.id);
    } catch {
      session = null;
    }
    this.sessionCache.set(entry.file, session);
    return session;
  }
}
