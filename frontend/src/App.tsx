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
import { useTheme } from "./shell/useTheme";
import ThemeToggle from "./shell/ThemeToggle";

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
  const { theme, toggle: toggleTheme } = useTheme();

  // ------------------------------------------------------------------
  // Mascota — ref para controlarla desde cualquier parte de la lógica
  // ------------------------------------------------------------------
  const mascotRef = useRef<MascotAsistenteRef>(null);
  const mascotOverlayRef = useRef<HTMLDivElement>(null);
  const [mascotTraveling, setMascotTraveling] = useState(false);

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
  // Banqui — sistema de tutorial guiado (paso a paso por pantalla)
  // ------------------------------------------------------------------

  // Pasos del tutorial por estado de la app
  type TutorialStep = { texto: string; cara: string; bigote: string; manoI: string; manoD: string; cargando?: boolean; };
  type ScreenId = "access" | "profile" | "landing" | "busy" | "surface" | "error";

  const TUTORIAL: Record<ScreenId, TutorialStep[]> = {
    access: [
      { texto: "Hola, ingresa el código de acceso para entrar.", cara: "normal", bigote: "normal", manoI: "normal", manoD: "enseñando" },
    ],
    profile: [
      { texto: "Hola, soy Banqui, tu asistente financiero de Banorte.", cara: "normal", bigote: "normal", manoI: "normal", manoD: "enseñando" },
      { texto: "Cuéntame sobre ti — entre más sepa de ti, mejores consejos podré darte.", cara: "normal", bigote: "normal", manoI: "normal", manoD: "normal" },
      { texto: "Llena los campos y acepta el aviso de privacidad para comenzar.", cara: "normal", bigote: "normal", manoI: "enseñando", manoD: "enseñando" },
    ],
    landing: [
      { texto: "Listo, ya sé quién eres. Esta es tu pantalla principal.", cara: "normal", bigote: "normal", manoI: "normal", manoD: "pulgarArriba" },
      { texto: "Puedo analizar tus ahorros, inversiones y ayudarte con metas financieras.", cara: "normal", bigote: "normal", manoI: "normal", manoD: "normal" },
      { texto: "Elige una sugerencia o escribe tu propia pregunta abajo.", cara: "normal", bigote: "normal", manoI: "normal", manoD: "apuntando" },
    ],
    busy: [
      { texto: "Déjame revisar eso…", cara: "pensativo", bigote: "ninguno", manoI: "ninguna", manoD: "ninguna", cargando: true },
    ],
    surface: [
      { texto: title ? `Listo. ${title.slice(0, 60)}` : "Aquí está tu información.", cara: "normal", bigote: "normal", manoI: "normal", manoD: "pulgarArriba" },
      { texto: "Puedes interactuar con cada sección. ¿Tienes alguna duda? Escríbeme.", cara: "normal", bigote: "normal", manoI: "normal", manoD: "enseñando" },
    ],
    error: [
      { texto: "Algo salió mal. ¿Lo intentamos de nuevo?", cara: "preocupado", bigote: "ninguno", manoI: "ninguna", manoD: "ninguna" },
    ],
  };

  const [tutorialStep, setTutorialStep] = useState(0);
  const prevScreenRef = useRef<ScreenId | null>(null);

  // Determina la pantalla actual para seleccionar los pasos del tutorial
  // (calculado aquí para usarlo tanto en la lógica como en el JSX)
  const currentScreenForTutorial: ScreenId = needsAccessKey ? "access"
    : !profile ? "profile"
    : error ? "error"
    : busy ? "busy"
    : !surface ? "landing"
    : "surface";

  // Detectar cambio de pantalla principal para activar el squish de viaje de Banqui
  const prevMascotScreenRef = useRef<string>("");
  useEffect(() => {
    const screen = currentScreenForTutorial;
    if (prevMascotScreenRef.current === "") { prevMascotScreenRef.current = screen; return; }
    if (prevMascotScreenRef.current === screen) return;
    prevMascotScreenRef.current = screen;
    setMascotTraveling(true);
    const t = setTimeout(() => setMascotTraveling(false), 620);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreenForTutorial]);

  // Cuando la pantalla cambia → reinicia el tutorial y aplica paso 0
  useEffect(() => {
    const screen = currentScreenForTutorial;
    if (prevScreenRef.current === screen) return;
    prevScreenRef.current = screen;
    setTutorialStep(0);

    const steps = TUTORIAL[screen];
    const step = steps[0];
    if (!step || !mascotRef.current) return;
    const m = mascotRef.current;
    const t = setTimeout(() => {
      m.setPose({ cara: step.cara, bigote: step.bigote, manoIzquierda: step.manoI, manoDerecha: step.manoD });
      m.setCargando(step.cargando ?? false);
      m.hablar(step.texto);
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreenForTutorial, title]);

  // Avanza al siguiente paso del tutorial (botón "Continuar →" en el globo)
  const handleContinuar = useCallback(() => {
    const screen = currentScreenForTutorial;
    const steps = TUTORIAL[screen];
    const nextStep = tutorialStep + 1;
    if (nextStep >= steps.length) {
      // Último paso: callar a Banqui
      mascotRef.current?.callar();
      return;
    }
    setTutorialStep(nextStep);
    const step = steps[nextStep];
    if (!step || !mascotRef.current) return;
    const m = mascotRef.current;
    m.setPose({ cara: step.cara, bigote: step.bigote, manoIzquierda: step.manoI, manoDerecha: step.manoD });
    m.setCargando(step.cargando ?? false);
    m.hablar(step.texto);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreenForTutorial, tutorialStep, title]);

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
    ? renderSurface(surface, viewData, { setLocal, runAction, busy })
    : null;

  // Banqui — siempre montado para ilusión de continuidad entre pantallas.
  // Siempre en el lado izquierdo, centrado verticalmente, tamaño fijo 240px.
  // Mascota sigue el mouse verticalmente (solo en desktop, en surface view)
  const isWide = useRef(window.innerWidth > 768);
  useEffect(() => {
    const onResize = () => { isWide.current = window.innerWidth > 768; };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = mascotOverlayRef.current;
    if (!el) return;
    let raf = 0;
    let targetY = window.innerHeight / 2;
    let currentY = targetY;
    const mascotH = 240;
    const pad = 60;

    const onMove = (e: MouseEvent) => {
      if (!isWide.current) return;
      const minY = pad;
      const maxY = window.innerHeight - mascotH - pad;
      targetY = Math.max(minY, Math.min(maxY, e.clientY - mascotH / 2));
    };

    const tick = () => {
      currentY += (targetY - currentY) * 0.08;
      if (isWide.current && !el.classList.contains("bn-mascot-overlay--landing") && !el.classList.contains("bn-mascot-overlay--profile")) {
        el.style.top = `${currentY}px`;
        el.style.transform = "none";
      } else {
        el.style.top = "";
        el.style.transform = "";
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const mascotaOverlay = (
    <div
      ref={mascotOverlayRef}
      className={`bn-mascot-overlay${
        currentScreenForTutorial === "surface" || currentScreenForTutorial === "busy"
          ? "" : currentScreenForTutorial === "profile"
          ? " bn-mascot-overlay--profile" : " bn-mascot-overlay--landing"
      }`}
    >
      {/* Wrapper interno para el squish de viaje sin conflicto con la transición de posición */}
      <div className={mascotTraveling ? "bn-mascot-squish--active" : undefined}>
        <MascotAsistente
          ref={mascotRef}
          size={240}
          caraInicial="normal"
          bigoteInicial="normal"
          manoIzquierdaInicial="normal"
          manoDerechaInicial="enseñando"
          onContinuar={handleContinuar}
        />
      </div>
    </div>
  );

  if (needsAccessKey) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} fixed />
        <AccessGate wrongKey={hadWrongKey} onSubmit={() => location.reload()} />
        {mascotaOverlay}
      </>
    );
  }

  if (!profile) {
    // Banqui como overlay (siempre el mismo) — no se pasa como prop interno
    // para mantener la ilusión de continuidad (mismo componente montado).
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} fixed />
        <ProfileGate onSubmit={() => setProfileState(getProfile())} />
        {mascotaOverlay}
      </>
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
        <>
          <ThemeToggle theme={theme} onToggle={toggleTheme} fixed />
          <Home onSend={handleSend} disabled={busy} theme={theme} />
        </>
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
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
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
