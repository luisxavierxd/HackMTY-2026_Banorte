/**
 * El WebSocket del harness, apuntando a donde el usuario diga (§4.3).
 *
 * Mismo protocolo de siempre (`net/useSocket.ts`): backoff exponencial,
 * cierre 4401 para credencial mala, perfil adjunto en cada mensaje. La
 * diferencia es la forma: aquí es un `TurnEngine` con async generators en vez
 * de un hook de React, para que la UI no sepa cuál de los tres motores corre.
 *
 * `useSocket.ts` se queda donde está — lo sigue usando el target legacy.
 *
 * Trampa documentada en §7 de la spec: el placeholder es `ws://127.0.0.1:8080`
 * y NO `ws://localhost:8080`. Chrome bloquea `ws://localhost` desde una página
 * servida por HTTPS (mixed content); la IP de loopback sí pasa.
 */
import type { ActionMessage, ClientMessage } from "../contract/events";
import { getProfile } from "../net/profile";
import { getSessionId } from "../net/useSocket";
import { EngineUnreachable, type EngineStatus, type HarnessEvent, type TurnEngine, type TurnOptions } from "./types";

/** Placeholder y default del campo de URL. Loopback por IP, a propósito. */
export const DEFAULT_REMOTE_URL = "ws://127.0.0.1:8080";

/** Código con el que `AccessKeyMiddleware` cierra el WS por key inválida. */
export const WS_CLOSE_BAD_ACCESS_KEY = 4401;

const CONNECT_TIMEOUT_MS = 5000;
const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

/** Eventos que cierran un turno. `error` no cierra la conexión, solo el turno. */
function isTerminal(event: HarnessEvent): boolean {
  return event.type === "turn_end" || event.type === "error";
}

/**
 * Acepta `ws://host:port`, `http://host:port` o `host:port` pelón y devuelve
 * una base `ws(s)://host:port` sin diagonal final. La gente escribe las tres.
 */
export function normalizeRemoteUrl(raw: string): string {
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return `wss://${trimmed.slice("https://".length)}`;
  if (/^http:\/\//i.test(trimmed)) return `ws://${trimmed.slice("http://".length)}`;
  return `ws://${trimmed}`;
}

function httpOrigin(wsUrl: string): string {
  if (/^wss:\/\//i.test(wsUrl)) return `https://${wsUrl.slice("wss://".length)}`;
  if (/^ws:\/\//i.test(wsUrl)) return `http://${wsUrl.slice("ws://".length)}`;
  return wsUrl;
}

/**
 * Cola que convierte el empuje del socket en el jalón del generador.
 * Si el consumidor va más lento que el socket, los eventos se acumulan; si va
 * más rápido, espera. Sin esto, un evento que llega entre dos `yield` se pierde.
 */
class EventQueue {
  private readonly items: HarnessEvent[] = [];
  private resolve: (() => void) | null = null;
  private failure: Error | null = null;
  private closed = false;

  push(event: HarnessEvent): void {
    if (this.closed) return;
    this.items.push(event);
    this.wake();
  }

  fail(error: Error): void {
    if (this.closed) return;
    this.failure = error;
    this.closed = true;
    this.wake();
  }

  close(): void {
    this.closed = true;
    this.wake();
  }

  private wake(): void {
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  /** Siguiente evento, o `null` cuando ya no va a llegar nada más. */
  async next(): Promise<HarnessEvent | null> {
    for (;;) {
      const item = this.items.shift();
      if (item) return item;
      if (this.failure) throw this.failure;
      if (this.closed) return null;
      await new Promise<void>((resolve) => {
        this.resolve = resolve;
      });
    }
  }
}

export interface RemoteWsEngineOptions {
  url: string;
  accessCode?: string;
}

export class RemoteWsEngine implements TurnEngine {
  readonly id = "remote" as const;
  readonly label = "CLI local";
  /** El harness reporta su modelo real en `turn_end`; hasta entonces, nada. */
  readonly model = "";

  private readonly base: string;
  private readonly accessCode: string;
  private sessionId: string;

  private ws: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private backoff = MIN_BACKOFF_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private authFailed = false;
  /** `null` = todavía no se intenta. Evita pintar el chip en rojo al arrancar. */
  private reachable: boolean | null = null;

  private active: EventQueue | null = null;

  constructor({ url, accessCode = "" }: RemoteWsEngineOptions) {
    this.base = normalizeRemoteUrl(url);
    this.accessCode = accessCode.trim();
    this.sessionId = getSessionId();
    // conectar de una vez: así `status()` dice la verdad antes del primer turno
    if (this.base) void this.ensureSocket().catch(() => undefined);
  }

  status(): EngineStatus {
    if (!this.base) return "needs-credential";
    if (this.authFailed) return "needs-credential";
    if (this.reachable === false) return "unreachable";
    return "ready";
  }

  async reset(): Promise<void> {
    const previous = this.sessionId;
    try {
      await fetch(`${httpOrigin(this.base)}/v1/session/${encodeURIComponent(previous)}`, {
        method: "DELETE",
        headers: this.accessCode ? { "X-App-Key": this.accessCode } : undefined,
      });
    } catch {
      // el harness ya no está o no hay red: empezar de nuevo no debe bloquearse
    }
    this.sessionId = getSessionId();
  }

  /** Cierra todo. La UI lo llama al cambiar de proveedor. */
  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.active?.fail(new EngineUnreachable("conexión cerrada"));
    this.active = null;
    this.ws?.close();
    this.ws = null;
    this.connecting = null;
  }

  send(text: string, options: TurnOptions = {}): AsyncIterable<HarnessEvent> {
    return this.run({ type: "user_message", text }, options);
  }

  act(action: ActionMessage, options: TurnOptions = {}): AsyncIterable<HarnessEvent> {
    return this.run(action, options);
  }

  // ---------------------------------------------------------------- //

  private async *run(
    message: ClientMessage,
    options: TurnOptions
  ): AsyncIterable<HarnessEvent> {
    const { signal } = options;
    if (signal?.aborted) return;

    const socket = await this.ensureSocket();
    if (signal?.aborted) return;

    const queue = new EventQueue();
    this.active = queue;

    const onAbort = () => queue.close();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const profile = getProfile();
      socket.send(JSON.stringify(profile ? { ...message, profile } : message));

      for (;;) {
        const event = await queue.next();
        if (event === null) return;
        yield event;
        if (isTerminal(event)) return;
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      if (this.active === queue) this.active = null;
    }
  }

  private ensureSocket(): Promise<WebSocket> {
    if (this.disposed) return Promise.reject(new EngineUnreachable("motor cerrado"));
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve(this.ws);
    if (this.connecting) return this.connecting;
    if (!this.base) return Promise.reject(new EngineUnreachable("falta la URL del harness"));

    this.connecting = this.openSocket().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private openSocket(): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const qs = this.accessCode ? `?key=${encodeURIComponent(this.accessCode)}` : "";
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${this.base}/ws/${this.sessionId}${qs}`);
      } catch (err) {
        this.reachable = false;
        reject(new EngineUnreachable(`URL inválida: ${String(err)}`));
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.reachable = false;
        // cerrar el socket colgado: sin esto queda intentando en segundo plano
        try {
          ws.close();
        } catch {
          /* ya estaba muerto */
        }
        reject(new EngineUnreachable(`el harness no respondió en ${CONNECT_TIMEOUT_MS / 1000}s`));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        this.ws = ws;
        this.backoff = MIN_BACKOFF_MS;
        this.reachable = true;
        this.authFailed = false;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ws);
      };

      ws.onmessage = (raw) => {
        let data: unknown;
        try {
          data = JSON.parse(raw.data as string);
        } catch {
          console.warn("[remote] mensaje no parseable");
          return;
        }
        if (!data || typeof data !== "object") return;
        const event = data as { type?: unknown };
        // el heartbeat mantiene vivo el socket detrás de proxies; no es
        // parte del contrato de eventos, así que no sale del motor
        if (event.type === "heartbeat") return;
        if (typeof event.type !== "string") return;
        this.active?.push(data as HarnessEvent);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* idem */
        }
      };

      ws.onclose = (ev) => {
        if (this.ws === ws) this.ws = null;
        clearTimeout(timer);

        if (ev.code === WS_CLOSE_BAD_ACCESS_KEY) {
          this.authFailed = true;
          this.reachable = true; // el harness sí está; lo que falla es la key
          const err = new EngineUnreachable("código de acceso inválido");
          this.active?.fail(err);
          if (!settled) {
            settled = true;
            reject(err);
          }
          return; // no reintentar en loop con la misma key mala
        }

        // el turno en vuelo se queda sin su respuesta: hay que avisar para
        // que la capa de arriba degrade a `recorded` en vez de colgarse
        this.active?.fail(new EngineUnreachable("la conexión se cerró a medio turno"));

        if (!settled) {
          settled = true;
          this.reachable = false;
          reject(new EngineUnreachable("no se pudo conectar con el harness"));
        }
        this.scheduleRetry();
      };
    });
  }

  private scheduleRetry(): void {
    if (this.disposed || this.authFailed) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.ensureSocket().catch(() => undefined);
    }, delay);
  }
}
