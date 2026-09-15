import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerEvent } from "../contract/events";
import { getAccessKey } from "./accessKey";
import { getCookie, setCookie, deleteCookie } from "./cookies";
import { getProfile } from "./profile";

//: código que AccessKeyMiddleware manda al cerrar el WS por código de acceso
//: inválido/faltante (ver src/harness/auth.py) — distinto de un cierre normal.
export const WS_CLOSE_BAD_ACCESS_KEY = 4401;

export type SocketStatus = "connecting" | "open" | "closed";

const SESSION_KEY = "bn-session-id";
const SESSION_DAYS = 30;
const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

/** Cookie, no sessionStorage: así la conversación "regresa" al reabrir el
 *  navegador (aunque haya sido en otra pestaña o días después), no solo al
 *  refrescar la misma pestaña — es lo que hace que la demo parezca tener
 *  una base de datos detrás. Ver PrivacyNotice.tsx para el aviso legal que
 *  acompaña este uso de cookies. */
export function getSessionId(): string {
  let id = getCookie(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCookie(SESSION_KEY, id, SESSION_DAYS);
  }
  return id;
}

/** Borra el sessionId guardado — la próxima carga arranca una sesión nueva.
 *  Úsalo junto con `DELETE /v1/session/{id}` (net/client.ts::deleteSession)
 *  y una recarga de página para un "Nueva conversación" limpio de verdad. */
export function clearStoredSession(): void {
  deleteCookie(SESSION_KEY);
}

/** Cambia cuál conversación (de las guardadas en net/conversations.ts) es la
 *  activa. Igual que clearStoredSession, requiere recargar la página después
 *  (useSocket abre el WS una sola vez al montar). */
export function setActiveSessionId(id: string): void {
  setCookie(SESSION_KEY, id, SESSION_DAYS);
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
export function useSocket(
  onEvent: (event: ServerEvent) => void,
  enabled: boolean = true,
  onAuthError?: () => void
) {
  const [status, setStatus] = useState<SocketStatus>(enabled ? "connecting" : "closed");
  const sessionIdRef = useRef(getSessionId());
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(MIN_BACKOFF_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const onAuthErrorRef = useRef(onAuthError);
  const unmountedRef = useRef(false);
  onEventRef.current = onEvent;
  onAuthErrorRef.current = onAuthError;

  useEffect(() => {
    if (!enabled) return;
    unmountedRef.current = false;

    function connect() {
      setStatus("connecting");
      const key = getAccessKey();
      const qs = key ? `?key=${encodeURIComponent(key)}` : "";
      const ws = new WebSocket(`${wsBase()}/ws/${sessionIdRef.current}${qs}`);
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
      ws.onclose = (event) => {
        setStatus("closed");
        if (unmountedRef.current) return;
        if (event.code === WS_CLOSE_BAD_ACCESS_KEY) {
          onAuthErrorRef.current?.();
          return; // no reintentar solo con la misma key mala en loop
        }
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
      // El perfil viaja en cada mensaje (no solo al conectar): así el
      // servidor lo tiene siempre fresco, incluso si la sesión del harness
      // se perdió (restart, TTL) — ver Session.profile en session/store.py.
      const profile = getProfile();
      const payload = profile ? { ...message, profile } : message;
      ws.send(JSON.stringify(payload));
      return true;
    }
    console.warn("[ws] no conectado, mensaje descartado", message);
    return false;
  }, []);

  return { status, sessionId: sessionIdRef.current, send };
}
