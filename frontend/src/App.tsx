import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./design/base.css";
import "./App.css";
import "./mascot/mascot.css";
import MascotAsistente, { type MascotAsistenteRef } from "./mascot/MascotAsistente";

import type { ActionRef, Envelope } from "./contract/a2ui";
import type { ServerEvent } from "./contract/events";
import { applyEnvelopes, type SurfaceState } from "./a2ui/surfaceReducer";
import { renderSurface } from "./a2ui/registry";
import { pointerSet } from "./a2ui/pointer";
import { useSocket, clearStoredSession, setActiveSessionId } from "./net/useSocket";
import { sendAction, sendUserMessage, deleteSession } from "./net/client";
import { getAccessKey, clearAccessKey } from "./net/accessKey";
import { getProfile, clearProfile } from "./net/profile";
import {
  ensureConversation,
  listConversations,
  upsertConversation,
  removeConversation,
  clearConversations,
  deriveTitle,
  type ConversationRecord,
  type TranscriptEntry,
} from "./net/conversations";

import AccessGate from "./shell/AccessGate";
import ProfileGate from "./shell/ProfileGate";
import ProfileSidebar from "./shell/ProfileSidebar";
import Composer from "./shell/Composer";
import Trace, { type TraceStatus } from "./shell/Trace";
import Home from "./shell/Home";
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

function SidebarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

export default function App() {
  // ------------------------------------------------------------------
  // Mascota — ref para controlarla desde cualquier parte de la lógica
  // ------------------------------------------------------------------
  const mascotRef = useRef<MascotAsistenteRef>(null);

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

  // Perfil que da contexto al agente (nombre/ingreso/ahorro/inversión) —
  // segundo paso del "login" de la demo, después del código de acceso. Vive
  // en cookie (net/profile.ts) para sobrevivir a cerrar el navegador.
  const [profile, setProfileState] = useState(() => getProfile());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logoutProfile = useCallback(() => {
    // Mismo patrón que startNewConversation: recarga completa porque
    // useSocket abre el WS una sola vez al montar. "Salir" borra perfil Y
    // TODAS las conversaciones guardadas (pedido explícito: el logout es lo
    // único que las borra, ver PrivacyNotice.tsx).
    void deleteSession(sessionId).finally(() => {
      clearProfile();
      clearStoredSession();
      clearConversations();
      location.reload();
    });
  }, [sessionId]);

  // Índice de conversaciones (net/conversations.ts) para la lista del
  // sidebar. Se refresca cada vez que la conversación activa cambia (efecto
  // de sync más abajo) o cuando se borra/crea una desde el sidebar.
  const [conversationsList, setConversationsList] = useState<ConversationRecord[]>([]);
  // Evita que el efecto de sync pise el registro guardado con el estado
  // vacío inicial antes de que la hidratación (mount) alcance a correr.
  const hydratedRef = useRef(false);

  useEffect(() => {
    const record = ensureConversation(sessionId);
    if (record.transcript.length > 0 || record.lastSurface) {
      surfaceRef.current = record.lastSurface;
      setSurface(record.lastSurface);
      setTitle(record.lastTitle || "");
      setTranscript(record.transcript);
    }
    setConversationsList(listConversations());
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const firstUserText = transcript.find((e) => e.role === "user")?.text || "";
    upsertConversation({
      id: sessionId,
      title: deriveTitle(firstUserText),
      updatedAt: Date.now(),
      transcript,
      lastSurface: surface,
      lastTitle: title,
    });
    setConversationsList(listConversations());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, surface, title, sessionId]);

  const switchConversation = useCallback(
    (id: string) => {
      if (id === sessionId) {
        setSidebarOpen(false);
        return;
      }
      setActiveSessionId(id);
      location.reload();
    },
    [sessionId]
  );

  const newConversationFromSidebar = useCallback(() => {
    // No borra la conversación activa del lado del harness (a diferencia de
    // startNewConversation de abajo) — la que se deja atrás sigue siendo
    // resumible desde el sidebar.
    clearStoredSession();
    location.reload();
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      void deleteSession(id).finally(() => {
        removeConversation(id);
        if (id === sessionId) {
          clearStoredSession();
          location.reload();
        } else {
          setConversationsList(listConversations());
        }
      });
    },
    [sessionId]
  );

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

  // Mismo botón "Nueva conversación" del topbar y "+ Nueva conversación" del
  // sidebar: NO borra la conversación activa (queda guardada y resumible
  // desde el sidebar) — solo limpia cuál es la activa. Recarga completa a
  // propósito: useSocket abre el WS una sola vez al montar, con el
  // sessionId de ese momento, y clearStoredSession hace que la próxima
  // carga saque un sessionId nuevo (net/useSocket.ts::getSessionId).
  const startNewConversation = newConversationFromSidebar;

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

  // ------------------------------------------------------------------
  // Mascota — reacciones a cambios de estado de la app
  // ------------------------------------------------------------------

  // Saludo en ProfileGate: cuando el perfil aún no está capturado
  useEffect(() => {
    if (!profile && !needsAccessKey && mascotRef.current) {
      mascotRef.current.setPose({ cara: "normal", bigote: "normal", manoIzquierda: "normal", manoDerecha: "enseñando" });
      // Pequeño delay para que el DOM ya esté pintado
      const t = setTimeout(() => {
        mascotRef.current?.hablar("¡Hola! Soy Bancho 👋 Cuéntame de ti para darte el mejor consejo financiero.");
      }, 600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, needsAccessKey]);

  // Saludo en pantalla vacía: perfil listo, sin conversación aún
  useEffect(() => {
    if (profile && !surface && status === "open" && mascotRef.current) {
      mascotRef.current.setPose({ cara: "normal", bigote: "normal", manoIzquierda: "normal", manoDerecha: "apuntando" });
      const t = setTimeout(() => {
        mascotRef.current?.hablar("¿En qué te ayudo hoy? Puedo revisar tus ahorros, deudas o metas 💡");
      }, 800);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, status]);

  // Estado "pensando": cuando el agente está procesando
  useEffect(() => {
    if (!mascotRef.current) return;
    if (busy) {
      mascotRef.current.setPose({ cara: "pensativo", bigote: "ninguno", manoIzquierda: "ninguna", manoDerecha: "ninguna" });
      mascotRef.current.setCargando(true);
      mascotRef.current.hablar("Déjame revisar eso…");
    } else {
      mascotRef.current.setCargando(false);
    }
  }, [busy]);

  // Nueva respuesta del agente llegó
  useEffect(() => {
    if (!surface || !mascotRef.current) return;
    const m = mascotRef.current;
    m.setCargando(false);
    m.setPose({ cara: "normal", bigote: "normal", manoIzquierda: "normal", manoDerecha: "pulgarArriba" });
    // Usa el title del turno si hay, si no un mensaje genérico
    const texto = title
      ? `¡Listo! ${title}`
      : "¡Aquí está tu información! ¿Tienes alguna duda?";
    m.hablar(texto.length > 80 ? texto.slice(0, 80) + "…" : texto);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  // Error
  useEffect(() => {
    if (!error || !mascotRef.current) return;
    mascotRef.current.setCargando(false);
    mascotRef.current.setPose({ cara: "preocupado", bigote: "ninguno", manoIzquierda: "ninguna", manoDerecha: "ninguna" });
    mascotRef.current.hablar("Ups, algo salió mal. ¿Lo intentamos de nuevo?");
  }, [error]);

  // ------------------------------------------------------------------

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
  // Landing "Liquid Glass" (Home.tsx): pantalla de arranque a pantalla
  // completa, sin topbar/composer fijo — solo mientras no hay conversación
  // activa. Se mantiene también mientras se espera la primera respuesta
  // (busy sin surface todavía), ver spec de la migración.
  const showLanding = !hasSurface && status === "open";

  const body: ReactNode = hasSurface
    ? renderSurface(surface, viewData, { setLocal, runAction })
    : null;

  // La mascota acompaña al usuario en TODAS las pantallas — se renderiza
  // siempre como overlay fijo; en landing se centra arriba del título en
  // vez de la esquina inferior (ver mascot.css ".bn-mascot-overlay--landing").
  const mascotaOverlay = (
    <div className={`bn-mascot-overlay${showLanding && profile && !needsAccessKey ? " bn-mascot-overlay--landing" : ""}`}>
      <MascotAsistente
        ref={mascotRef}
        size={160}
        caraInicial="normal"
        bigoteInicial="normal"
        manoIzquierdaInicial="normal"
        manoDerechaInicial="enseñando"
      />
    </div>
  );

  if (needsAccessKey) {
    return (
      <AccessGate
        wrongKey={hadWrongKey}
        onSubmit={() => location.reload()}
        mascot={
          <MascotAsistente
            ref={mascotRef}
            size={160}
            caraInicial="normal"
            bigoteInicial="normal"
            manoIzquierdaInicial="normal"
            manoDerechaInicial="enseñando"
          />
        }
      />
    );
  }

  if (!profile) {
    return (
      <ProfileGate
        onSubmit={() => setProfileState(getProfile())}
        mascot={
          <MascotAsistente
            ref={mascotRef}
            size={160}
            caraInicial="normal"
            bigoteInicial="normal"
            manoIzquierdaInicial="normal"
            manoDerechaInicial="enseñando"
          />
        }
      />
    );
  }

  return (
    <>
    <button
      type="button"
      className="bn-sidebar-launcher"
      aria-label={sidebarOpen ? "Cerrar menú" : "Ver tu contexto"}
      aria-expanded={sidebarOpen}
      onClick={() => setSidebarOpen((v) => !v)}
    >
      {sidebarOpen ? <CloseIcon /> : <SidebarIcon />}
    </button>
    <div className="bn-shell">
      <ProfileSidebar
        profile={profile}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={logoutProfile}
        conversations={conversationsList}
        activeId={sessionId}
        onNewConversation={newConversationFromSidebar}
        onSelectConversation={switchConversation}
        onDeleteConversation={deleteConversation}
      />
      <div className={`bn-app${showLanding ? " bn-app--full" : ""}`}>
      {showLanding ? (
        <Home onSend={handleSend} disabled={busy} />
      ) : !hasSurface ? (
        <Loading />
      ) : (
      <>
      <header className="bn-topbar">
        <span className="bn-topbar__title">{title || "Banky"}</span>
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
      </>
      )}
      </div>
    </div>
    {mascotaOverlay}
    </>
  );
}
