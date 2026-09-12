import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import "./design/base.css";
import "./App.css";

import type { ActionRef, Envelope } from "./contract/a2ui";
import type { ServerEvent } from "./contract/events";
import { applyEnvelopes, type SurfaceState } from "./a2ui/surfaceReducer";
import { renderSurface } from "./a2ui/registry";
import { pointerSet } from "./a2ui/pointer";
import { useSocket } from "./net/useSocket";
import { sendAction, sendUserMessage } from "./net/client";

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

export default function App() {
  const [surface, setSurface] = useState<SurfaceState>(null);
  const [turnId, setTurnId] = useState(0); // fuerza reset del ErrorBoundary en cada surface nueva
  const [title, setTitle] = useState("");
  const [trace, setTrace] = useState<TraceStatus>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});

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
      case "surface":
        setSurface((prev) => applyEnvelopes(prev, event.a2ui));
        setTurnId((n) => n + 1);
        setTitle(event.title || "");
        setOverrides({});
        setBusy(false);
        setError(null);
        break;
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
  }, []);

  const { status, send } = useSocket(handleEvent, !IS_LAB);

  const runAction = useCallback(
    (action: ActionRef | undefined) => {
      if (!action) return;
      setBusy(true);
      setError(null);
      sendAction(send, action, overrides);
    },
    [send, overrides]
  );

  const handleSend = useCallback(
    (text: string) => {
      setBusy(true);
      setError(null);
      sendUserMessage(send, text);
    },
    [send]
  );

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

  return (
    <div className="bn-app">
      <header className="bn-topbar">
        <span className="bn-topbar__title">{title || "Banorte"}</span>
        <button
          type="button"
          className="bn-topbar__refresh"
          aria-label="Reiniciar conversación"
          onClick={() => location.reload()}
        >
          <RefreshIcon />
        </button>
      </header>

      <main className="bn-surface-area">
        <SurfaceErrorBoundary
          key={turnId}
          onReset={() => {
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
