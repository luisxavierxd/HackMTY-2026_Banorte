import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./design/base.css";
import "./App.css";

import type { ActionRef, Envelope } from "./contract/a2ui";
import type { ServerEvent } from "./contract/events";
import { applyEnvelopes, type SurfaceState } from "./a2ui/surfaceReducer";
import { renderSurface } from "./a2ui/registry";
import { pointerSet } from "./a2ui/pointer";
import { useSocket, clearStoredSession } from "./net/useSocket";
import { sendAction, sendUserMessage, deleteSession } from "./net/client";
import { getAccessKey, clearAccessKey } from "./net/accessKey";

import AccessGate from "./shell/AccessGate";
import Composer from "./shell/Composer";
import Trace, { type TraceStatus } from "./shell/Trace";
import Empty from "./shell/Empty";
import ErrorBanner from "./shell/Error";
import Loading from "./shell/Loading";
import SurfaceErrorBoundary from "./shell/SurfaceErrorBoundary";
import Lab from "./lab/Lab";

const IS_LAB = new URLSearchParams(location.search).get("lab") === "1";

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 4v5h5M20 20v-5h-5M4.5 9a8 8 0 0 1 14.5-3M19.5 15a8 8 0 0 1-14.5 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
  ts: number;
  /** Solo en entradas "agent": la superficie completa de ese turno, para
   *  poder volver a verla/seguir desde ahí (ver restoreEntry). */
  surface?: SurfaceState;
  title?: string;
}

export default function App() {
  const [surface, setSurface] = useState<SurfaceState>(null);
  // Espejo síncrono de `surface`, para poder calcular el siguiente estado
  // dentro de handleEvent (mensajes del WS llegan uno a la vez, nunca en
  // paralelo) y guardarlo de una vez en el transcript — sin esto, la única
  // forma de leer el `surface` "de antes" es el setState funcional, que no
  // deja sacar el valor calculado hacia afuera para el transcript.
  const surfaceRef = useRef<SurfaceState>(null);
  const [turnId, setTurnId] = useState(0); // fuerza reset del ErrorBoundary en cada surface nueva
  const [title, setTitle] = useState("");
  const [trace, setTrace] = useState<TraceStatus>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});

  // Historial de la conversación: se pierde al recargar (vive solo en
  // memoria, no en sessionStorage) — es para no perder de vista lo que ya
  // se preguntó/respondió mientras la pantalla sigue cambiando, no un log
  // persistente. Colapsado por default para no estorbar.
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const addTranscript = useCallback(
    (role: TranscriptEntry["role"], text: string, extra?: Pick<TranscriptEntry, "surface" | "title">) => {
      if (!text) return;
      setTranscript((prev) => [...prev, { role, text, ts: Date.now(), ...extra }]);
    },
    []
  );

  // El CLI de Claude Code puede llamarse hasta 2 veces por turno (razonar +
  // componer UI), cada una con timeout de hasta CLI_TIMEOUT_S (180s por
  // default) — un turno puede tardar varios minutos en el peor caso. Sin
  // esto el usuario queda atrapado viendo "sigo revisando tus números…"
  // sin ninguna salida (visto en producción).
  const [canCancel, setCanCancel] = useState(false);
  useEffect(() => {
    if (!busy) {
      setCanCancel(false);
      return;
    }
    const timer = setTimeout(() => setCanCancel(true), 45_000);
    return () => clearTimeout(timer);
  }, [busy]);

  const cancelTurn = useCallback(() => {
    setBusy(false);
    setCanCancel(false);
    setTrace({ kind: "idle" });
    // No hay forma de cancelar el turno del lado del harness (el CLI sigue
    // corriendo hasta su propio timeout) — esto solo le regresa el control
    // al usuario. Si la respuesta vieja llega después, se sigue aplicando.
  }, []);

  const setLocal = useCallback((path: string, value: unknown) => {
    setOverrides((prev) => ({ ...prev, [path]: value }));
  }, []);

  const handleEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case "tool_call":
        setBusy(true);
        setTrace({ kind: "tool_call", name: event.name, ts: Date.now() });
        break;
      case "thinking":
        setTrace({ kind: "thinking", text: event.text, ts: Date.now() });
        break;
      case "surface": {
        const next = applyEnvelopes(surfaceRef.current, event.a2ui);
        surfaceRef.current = next;
        setSurface(next);
        setTurnId((n) => n + 1);
        setTitle(event.title || "");
        setOverrides({});
        setBusy(false);
        setError(null);
        addTranscript("agent", event.summary || event.title || "", { surface: next, title: event.title });
        break;
      }
      case "turn_end":
        setTrace({ kind: "done", latencyMs: event.latency_ms, provider: event.provider, model: event.model });
        setBusy(false);
        break;
      case "error":
        setError(event.message);
        setBusy(false);
        break;
      case "ack":
        setBusy(true);
        setTrace({ kind: "action", name: event.action, ts: Date.now() });
        break;
      case "ready":
      case "tool_result":
      default:
        break;
    }
  }, [addTranscript]);

  // Código de acceso: gate a nivel de app (no HTTP Basic Auth, ver
  // net/accessKey.ts) — si el harness rechaza la key (o no hay una puesta),
  // el WS se cierra con el código 4401 y se muestra AccessGate en vez de
  // reintentar la conexión en loop con la misma key mala.
  const [needsAccessKey, setNeedsAccessKey] = useState(false);
  const [hadWrongKey, setHadWrongKey] = useState(false);
  const handleAuthError = useCallback(() => {
    setHadWrongKey(Boolean(getAccessKey()));
    clearAccessKey();
    setNeedsAccessKey(true);
  }, []);

  const { status, sessionId, send } = useSocket(handleEvent, !IS_LAB, handleAuthError);

  const runAction = useCallback(
    (action: ActionRef | undefined, label?: string) => {
      if (!action) return;
      setBusy(true);
      setError(null);
      addTranscript("user", label || action.event.name.replace(/_/g, " "));
      sendAction(send, action, overrides);
    },
    [send, overrides, addTranscript]
  );

  const handleSend = useCallback(
    (text: string) => {
      setBusy(true);
      setError(null);
      addTranscript("user", text);
      sendUserMessage(send, text);
    },
    [send, addTranscript]
  );

  // Navegar el historial: muestra una pantalla de un turno anterior y deja
  // seguir interactuando desde ahí. A propósito NO es un árbol de verdad —
  // es un clon de esa pantalla puesto al final de la MISMA conversación
  // lineal (el servidor solo conoce una sesión, sin ramas). La siguiente
  // acción que se dispare manda esos datos completos como override
  // ("/" reemplaza todo el data model del servidor, ver pointer.ts /
  // messages.py::pointer_set) para que el agente vea exactamente esa
  // pantalla como "lo actual", no una mezcla con la más reciente. No es lo
  // más organizado (dijiste que estaba bien así), pero no divide la sesión.
  const restoreEntry = useCallback((entry: TranscriptEntry) => {
    if (!entry.surface) return;
    surfaceRef.current = entry.surface;
    setSurface(entry.surface);
    setTitle(entry.title || "");
    setOverrides(
      entry.surface.data && typeof entry.surface.data === "object" ? { "/": entry.surface.data } : {}
    );
    setTurnId((n) => n + 1);
    setTranscriptOpen(false);
  }, []);

  const startNewConversation = useCallback(() => {
    // Recarga completa a propósito: useSocket abre el WS una sola vez al
    // montar, con el sessionId de ese momento — no hay forma limpia de
    // "reconectar con otro id" sin recargar. deleteSession limpia el estado
    // viejo del harness; clearStoredSession hace que la próxima carga saque
    // un sessionId nuevo. Ninguna de las dos debe bloquear la recarga.
    void deleteSession(sessionId).finally(() => {
      clearStoredSession();
      location.reload();
    });
  }, [sessionId]);

  // Vista efectiva: data model del servidor + ediciones locales optimistas
  // (Slider/TextField/OptionList) todavía no confirmadas por el agente.
  const viewData = useMemo(() => {
    const base: Record<string, unknown> =
      surface && typeof surface.data === "object" && surface.data !== null && !Array.isArray(surface.data)
        ? JSON.parse(JSON.stringify(surface.data))
        : {};
    let out = base;
    for (const [path, value] of Object.entries(overrides)) {
      out = pointerSet(out, path, value);
    }
    return out;
  }, [surface, overrides]);

  // Galería offline de fixtures (?lab=1): reusa registry.tsx sin backend.
  const renderFixtureSurface = useCallback(
    (fixture: { a2ui?: Envelope[] }): ReactNode => {
      const fixtureSurface = applyEnvelopes(null, fixture.a2ui ?? []);
      const data =
        fixtureSurface && typeof fixtureSurface.data === "object" && fixtureSurface.data !== null
          ? fixtureSurface.data
          : {};
      return renderSurface(fixtureSurface, data, { setLocal, runAction });
    },
    [setLocal, runAction]
  );

  if (IS_LAB) {
    return <Lab renderSurface={renderFixtureSurface} />;
  }

  const hasSurface = !!surface && !!surface.root;

  let body: ReactNode;
  if (hasSurface) {
    body = renderSurface(surface, viewData, { setLocal, runAction });
  } else if (status !== "open") {
    body = <Loading />;
  } else {
    body = <Empty onSuggestion={handleSend} />;
  }

  if (needsAccessKey) {
    // Recarga completa a propósito: useSocket abre el WS una sola vez al
    // montar (mismo patrón que startNewConversation) — no hay forma limpia
    // de "reconectar con la key nueva" sin recargar.
    return <AccessGate wrongKey={hadWrongKey} onSubmit={() => location.reload()} />;
  }

  return (
    <div className="bn-app">
      <header className="bn-topbar">
        <span className="bn-topbar__title">{title || "Banorte"}</span>
        <div className="bn-topbar__actions">
          <button
            type="button"
            className="bn-topbar__history-toggle"
            aria-expanded={transcriptOpen}
            disabled={transcript.length === 0}
            onClick={() => setTranscriptOpen((v) => !v)}
          >
            Conversación <ChevronIcon open={transcriptOpen} />
          </button>
          <button
            type="button"
            className="bn-topbar__refresh"
            aria-label="Nueva conversación"
            title="Nueva conversación"
            onClick={startNewConversation}
          >
            <RefreshIcon />
          </button>
        </div>
      </header>

      {transcriptOpen && transcript.length > 0 && (
        <div className="bn-transcript" role="log">
          {transcript.map((entry, i) =>
            entry.surface ? (
              <button
                key={i}
                type="button"
                className="bn-transcript__item bn-transcript__item--agent bn-transcript__item--clickable"
                onClick={() => restoreEntry(entry)}
                title="Ver esta pantalla y seguir desde aquí"
              >
                <span className="bn-transcript__role">Asistente</span>
                {entry.text}
                <span className="bn-transcript__hint">Ver esta pantalla ↩</span>
              </button>
            ) : (
              <p key={i} className={`bn-transcript__item bn-transcript__item--${entry.role}`}>
                <span className="bn-transcript__role">{entry.role === "user" ? "Tú" : "Asistente"}</span>
                {entry.text}
              </p>
            )
          )}
        </div>
      )}

      <main className="bn-surface-area">
        <SurfaceErrorBoundary
          key={turnId}
          onReset={() => {
            surfaceRef.current = null;
            setSurface(null);
            setTitle("");
            setOverrides({});
          }}
        >
          {body}
        </SurfaceErrorBoundary>
      </main>

      {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}

      <Trace status={trace} />
      {canCancel && busy && (
        <button type="button" className="bn-trace-cancel" onClick={cancelTurn}>
          Esto está tardando más de lo normal — cancelar y reformular
        </button>
      )}
      <Composer onSend={handleSend} disabled={busy || status !== "open"} />
    </div>
  );
}
