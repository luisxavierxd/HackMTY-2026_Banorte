import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerEvent } from "../contract/events";

export type SocketStatus = "connecting" | "open" | "closed";

const SESSION_KEY = "bn-session-id";
const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Borra el sessionId guardado — la próxima carga arranca una sesión nueva.
 *  Úsalo junto con `DELETE /v1/session/{id}` (net/client.ts::deleteSession)
 *  y una recarga de página para un "Nueva conversación" limpio de verdad. */
export function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

function wsBase(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return import.meta.env.VITE_WS_BASE ?? `${proto}//${location.host}`;
}

/**
 * Conecta a /ws/{sessionId} y reconecta con backoff exponencial (0.5s -> 8s).
 * El sessionId persiste en sessionStorage para sobrevivir refresh de página.
 */
/**
 * `enabled=false` (ej. modo ?lab=1, que renderiza fixtures sin backend) evita
 * abrir el socket por completo: sin esto, cada intento de reconexión fallido
 * re-renderiza el árbol entero y hace que las gráficas de ECharts se
 * destruyan/reinicialicen en loop (nunca llegan a pintar nada estable).
 */
export function useSocket(onEvent: (event: ServerEvent) => void, enabled: boolean = true) {
  const [status, setStatus] = useState<SocketStatus>(enabled ? "connecting" : "closed");
  const sessionIdRef = useRef(getSessionId());
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(MIN_BACKOFF_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const unmountedRef = useRef(false);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    unmountedRef.current = false;

    function connect() {
      setStatus("connecting");
      const ws = new WebSocket(`${wsBase()}/ws/${sessionIdRef.current}`);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = MIN_BACKOFF_MS;
        setStatus("open");
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerEvent;
          onEventRef.current(data);
        } catch {
          console.warn("[ws] mensaje no parseable:", event.data);
        }
      };
      ws.onclose = () => {
        setStatus("closed");
        if (unmountedRef.current) return;
        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        timerRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [enabled]);

  const send = useCallback((message: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    console.warn("[ws] no conectado, mensaje descartado", message);
    return false;
  }, []);

  return { status, sessionId: sessionIdRef.current, send };
}
