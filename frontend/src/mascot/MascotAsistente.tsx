import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";

// =====================================================================
// ASSETS — rutas reales desde /public/mascota/ (Vite las sirve tal cual)
// =====================================================================
const CARAS: Record<string, string> = {
  normal: "/mascota/cara_normal.png",
  pensativo: "/mascota/cara_pensativo.png",
  preocupado: "/mascota/cara_preocupado.png",
};

const BIGOTES: Record<string, string | null> = {
  ninguno: null,
  normal: "/mascota/bigote_normal.png",
  estilo1: "/mascota/bigote_1.png",
};

const MANOS: Record<string, string | null> = {
  ninguna: null,
  normal: "/mascota/mano_normal.png",
  apuntando: "/mascota/mano_apuntando.png",
  pulgarArriba: "/mascota/mano_pulgararriba.png",
  enseñando: "/mascota/mano_enseñando.png",
};

// =====================================================================
// LAYOUT — medido sobre canvas cuadrado 1280×1280, guardado en %
// =====================================================================
const CANVAS = 1280;
const pct = (v: number) => (v / CANVAS) * 100;

const LAYOUT = {
  face: { x: pct(616), y: pct(578), w: pct(899) },
  mustache: { x: pct(714), y: pct(880), w: pct(284) },
  handLeft: { x: pct(234), y: pct(1058), w: pct(175) },
  handRight: { x: pct(1026), y: pct(1026), w: pct(175) },
};

const MANO_SCALE: Record<string, number> = {
  ninguna: 1,
  normal: 1,
  apuntando: 1.6,
  pulgarArriba: 1.2,
  enseñando: 1.6,
};

// ---- helpers de interpolación ----
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return a + diff * t;
};

// =====================================================================
// SONIDO SINTÉTICO — "blip" por caracter, estilo Animal Crossing.
// Sin archivos de audio: Web Audio API generada en tiempo real.
// =====================================================================
function useBlipSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  return (variant = 0, char = "") => {
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      ctxRef.current = new AC();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    const code = char ? char.toLowerCase().charCodeAt(0) : 97 + (variant % 26);
    const isVowel = "aeiouáéíóú".includes((char || "").toLowerCase());
    const baseFreq = 260 + (code % 14) * 26 + (isVowel ? 40 : 0);
    const duration = isVowel ? 0.09 : 0.065;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq * 1.15, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      baseFreq * 0.9,
      ctx.currentTime + duration
    );
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + duration
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  };
}

// =====================================================================
// TYPEWRITER — revela texto caracter por caracter
// =====================================================================
function useTypewriter(
  text: string,
  speedMs: number,
  playBlip: (v: number, c: string) => void,
  onChar?: (i: number, c: string) => void
) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setVisibleCount(i);
      const ch = text[i - 1];
      if (ch && ch.trim() !== "") {
        playBlip(i, ch);
        onChar?.(i, ch);
      }
      if (i >= text.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speedMs]);

  return { displayed: text.slice(0, visibleCount), done: visibleCount >= text.length };
}

// =====================================================================
// SPEECH BUBBLE
// =====================================================================
function SpeechBubble({
  text,
  speedMs = 35,
  playBlip,
  onChar,
  style,
  className,
}: {
  text: string;
  speedMs?: number;
  playBlip: (v: number, c: string) => void;
  onChar?: (i: number, c: string) => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const { displayed, done } = useTypewriter(text, speedMs, playBlip, onChar);
  if (!text) return null;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        background: "var(--bn-glass-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--bn-glass-border)",
        borderRadius: 16,
        padding: "12px 16px",
        boxShadow: "var(--bn-glass-glow), 0 8px 24px rgba(0, 0, 0, 0.3)",
        maxWidth: 240,
        minHeight: "2.4em",
        fontSize: 13,
        lineHeight: 1.4,
        color: "var(--bn-ink-near)",
        fontFamily: "inherit",
        ...style,
      }}
    >
      <span>{displayed}</span>
      {!done && (
        <span
          style={{
            display: "inline-block",
            width: 2,
            height: "1em",
            verticalAlign: "middle",
            background: "var(--bn-ink-near)",
            marginLeft: 2,
            animation: "mascot-caret-blink 0.8s steps(1) infinite",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          bottom: -8,
          left: 28,
          width: 14,
          height: 14,
          background: "var(--bn-glass-bg)",
          borderBottom: "1px solid var(--bn-glass-border)",
          borderRight: "1px solid var(--bn-glass-border)",
          transform: "rotate(45deg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      />
      <style>{`@keyframes mascot-caret-blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}

// =====================================================================
// MASCOT — componente presentacional puro (pose + animación RAF)
// =====================================================================
interface MascotProps {
  cara?: string;
  bigote?: string;
  manoIzquierda?: string;
  manoDerecha?: string;
  manoIzquierdaAngulo?: number;
  manoDerechaAngulo?: number;
  alive?: boolean;
  cargando?: boolean;
  speechTick?: number;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

const Mascot = forwardRef<{ pulseSquish: () => void }, MascotProps>(
  function Mascot(
    {
      cara = "normal",
      bigote = "ninguno",
      manoIzquierda = "ninguna",
      manoDerecha = "ninguna",
      manoIzquierdaAngulo = 0,
      manoDerechaAngulo = 0,
      alive = true,
      cargando = false,
      speechTick = 0,
      size = 380,
      style,
      className,
    },
    ref
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const mustacheRef = useRef<HTMLImageElement>(null);
    const handLRef = useRef<HTMLImageElement>(null);
    const handRRef = useRef<HTMLImageElement>(null);

    const squishEnergy = useRef(0);
    useEffect(() => {
      if (speechTick > 0) squishEnergy.current = 1;
    }, [speechTick]);

    const current = useRef({
      mustache: bigote !== "ninguno" ? 1 : 0,
      handL: manoIzquierda !== "ninguna" ? 1 : 0,
      handR: manoDerecha !== "ninguna" ? 1 : 0,
      angleL: manoIzquierdaAngulo,
      angleR: manoDerechaAngulo,
    });
    const target = useRef({
      ...current.current,
      scaleL: MANO_SCALE[manoIzquierda] ?? 1,
      scaleR: MANO_SCALE[manoDerecha] ?? 1,
    });

    useEffect(() => {
      target.current = {
        ...target.current,
        mustache: bigote !== "ninguno" ? 1 : 0,
        handL: manoIzquierda !== "ninguna" ? 1 : 0,
        handR: manoDerecha !== "ninguna" ? 1 : 0,
        scaleL: MANO_SCALE[manoIzquierda] ?? 1,
        scaleR: MANO_SCALE[manoDerecha] ?? 1,
      };
    }, [bigote, manoIzquierda, manoDerecha]);

    useEffect(() => {
      target.current = {
        ...target.current,
        angleL: manoIzquierdaAngulo,
        angleR: manoDerechaAngulo,
      };
    }, [manoIzquierdaAngulo, manoDerechaAngulo]);

    useImperativeHandle(ref, () => ({
      pulseSquish: () => {
        squishEnergy.current = 1;
      },
    }));

    useEffect(() => {
      let raf: number;
      const start = performance.now();

      const tick = (now: number) => {
        const t = (now - start) / 1000;
        const c = current.current;
        const tg = target.current;
        const ease = 0.09;

        c.mustache = lerp(c.mustache, tg.mustache, ease);
        c.handL = lerp(c.handL, tg.handL, ease);
        c.handR = lerp(c.handR, tg.handR, ease);
        c.angleL = lerpAngle(c.angleL, tg.angleL, 0.12);
        c.angleR = lerpAngle(c.angleR, tg.angleR, 0.12);

        const bodyFloat = alive
          ? Math.sin(t * 3.4) * (cargando ? 1.2 : 3)
          : 0;
        const bodyBreathe = alive
          ? 1 + Math.sin(t * 2.8) * (cargando ? 0.008 : 0.012)
          : 1;
        const bodySway = alive && !cargando ? Math.sin(t * 2.1) * 0.8 : 0;

        squishEnergy.current *= 0.85;
        const squishFreq = 26;
        const squishWave = Math.sin(t * squishFreq) * squishEnergy.current;
        const bodySquish = squishWave * 0.02;
        const mustacheSquish = squishWave * 0.26;

        const bodyScaleX = bodyBreathe * (1 + bodySquish);
        const bodyScaleY = bodyBreathe * (1 - bodySquish);

        const handLFloat = alive ? Math.sin(t * 4.4 + 1.1) * 4 : 0;
        const handLScale = alive ? 1 + Math.sin(t * 4.4 + 1.1) * 0.025 : 1;
        const handRFloat = alive ? Math.sin(t * 3.6 + 2.6) * 4 : 0;
        const handRScale = alive ? 1 + Math.sin(t * 3.6 + 2.6) * 0.025 : 1;

        const spinnerSpeed = 260;
        const mustacheRotation = cargando ? (t * spinnerSpeed) % 360 : 0;
        const mustacheFloat =
          alive && !cargando ? Math.sin(t * 4.9 + 0.4) * 0.9 : 0;
        const mustacheBase = 0.85 + c.mustache * 0.15;
        const mustacheScaleX = mustacheBase * (1 + mustacheSquish);
        const mustacheScaleY = mustacheBase * (1 - mustacheSquish);

        if (rootRef.current) {
          rootRef.current.style.transform = `translateY(${bodyFloat}px) rotate(${bodySway}deg) scale(${bodyScaleX}, ${bodyScaleY})`;
        }
        if (mustacheRef.current) {
          mustacheRef.current.style.opacity = String(c.mustache);
          mustacheRef.current.style.transform = cargando
            ? `translate(-50%, -50%) rotate(${mustacheRotation}deg) scale(${mustacheBase})`
            : `translate(-50%, calc(-50% + ${mustacheFloat}px)) scale(${mustacheScaleX}, ${mustacheScaleY})`;
        }

        const scaleL = tg.scaleL ?? 1;
        const scaleR = tg.scaleR ?? 1;

        if (handLRef.current) {
          handLRef.current.style.opacity = String(c.handL);
          handLRef.current.style.transform = `translate(-50%, calc(-50% + ${handLFloat}px)) scale(${handLScale * scaleL * (0.7 + c.handL * 0.3)}) scaleX(-1) rotate(${-c.angleL}deg)`;
        }
        if (handRRef.current) {
          handRRef.current.style.opacity = String(c.handR);
          handRRef.current.style.transform = `translate(-50%, calc(-50% + ${handRFloat}px)) scale(${handRScale * scaleR * (0.7 + c.handR * 0.3)}) rotate(${c.angleR}deg)`;
        }

        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [alive, cargando]);

    const layer = (l: { x: number; y: number; w: number }) =>
      ({
        position: "absolute" as const,
        left: `${l.x}%`,
        top: `${l.y}%`,
        width: `${l.w}%`,
        pointerEvents: "none" as const,
        userSelect: "none" as const,
      } satisfies React.CSSProperties);

    return (
      <div
        ref={rootRef}
        className={className}
        style={{ width: size, height: size, position: "relative", flexShrink: 0, ...style }}
      >
        <img
          src={CARAS[cara]}
          draggable={false}
          alt=""
          style={{ ...layer(LAYOUT.face), transform: "translate(-50%, -50%)" }}
        />
        {BIGOTES[bigote] && (
          <img
            ref={mustacheRef}
            src={BIGOTES[bigote]!}
            draggable={false}
            alt=""
            style={layer(LAYOUT.mustache)}
          />
        )}
        {MANOS[manoIzquierda] && (
          <img
            ref={handLRef}
            src={MANOS[manoIzquierda]!}
            draggable={false}
            alt=""
            style={layer(LAYOUT.handLeft)}
          />
        )}
        {MANOS[manoDerecha] && (
          <img
            ref={handRRef}
            src={MANOS[manoDerecha]!}
            draggable={false}
            alt=""
            style={layer(LAYOUT.handRight)}
          />
        )}
      </div>
    );
  }
);

// =====================================================================
// MASCOT ASISTENTE — API imperativa por ref para controlar desde afuera
// =====================================================================
export interface MascotAsistenteRef {
  /** Hace que Bancho diga un mensaje (typewriter + sonido + squish). */
  hablar(texto: string, opts?: { velocidad?: number }): void;
  /** Borra el globo de texto inmediatamente. */
  callar(): void;
  /** Cambia cualquier combinación de cara/bigote/manos/ángulos (merge parcial). */
  setPose(cambios: Partial<PoseState>): void;
  /** Prende/apaga el spinner de carga (el bigote gira). */
  setCargando(v: boolean): void;
  /** Prende/apaga la animación idle (flotación/respiración). */
  setAlive(v: boolean): void;
}

interface PoseState {
  cara: string;
  bigote: string;
  manoIzquierda: string;
  manoDerecha: string;
  manoIzquierdaAngulo: number;
  manoDerechaAngulo: number;
}

interface MascotAsistenteProps {
  caraInicial?: string;
  bigoteInicial?: string;
  manoIzquierdaInicial?: string;
  manoDerechaInicial?: string;
  size?: number;
  velocidadTextoDefault?: number;
  bubbleStyle?: React.CSSProperties;
  bubbleClassName?: string;
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
  onHablarEmpieza?: (texto: string) => void;
  onHablarTermina?: () => void;
}

const MascotAsistente = forwardRef<MascotAsistenteRef, MascotAsistenteProps>(
  function MascotAsistente(
    {
      caraInicial = "normal",
      bigoteInicial = "normal",
      manoIzquierdaInicial = "normal",
      manoDerechaInicial = "apuntando",
      size = 220,
      velocidadTextoDefault = 35,
      bubbleStyle,
      bubbleClassName,
      containerStyle,
      containerClassName,
      onHablarEmpieza,
    },
    ref
  ) {
    const [pose, setPoseState] = useState<PoseState>({
      cara: caraInicial,
      bigote: bigoteInicial,
      manoIzquierda: manoIzquierdaInicial,
      manoDerecha: manoDerechaInicial,
      manoIzquierdaAngulo: 0,
      manoDerechaAngulo: 0,
    });
    const [cargando, setCargandoState] = useState(false);
    const [alive, setAliveState] = useState(true);
    const [speech, setSpeech] = useState({
      text: "",
      nonce: 0,
      speed: velocidadTextoDefault,
    });
    const [speechTick, setSpeechTick] = useState(0);

    const playBlip = useBlipSound();

    useImperativeHandle(ref, () => ({
      hablar(texto, { velocidad = velocidadTextoDefault } = {}) {
        setSpeech((s) => ({ text: texto, nonce: s.nonce + 1, speed: velocidad }));
      },
      callar() {
        setSpeech((s) => ({ text: "", nonce: s.nonce + 1, speed: s.speed }));
      },
      setPose(cambios) {
        setPoseState((p) => ({ ...p, ...cambios }));
      },
      setCargando(v) {
        setCargandoState(v);
      },
      setAlive(v) {
        setAliveState(v);
      },
    }));

    useEffect(() => {
      if (speech.text) onHablarEmpieza?.(speech.text);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speech.nonce]);

    return (
      <div
        className={containerClassName}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          ...containerStyle,
        }}
      >
        <div style={{ marginLeft: size * 0.08, minHeight: "2.4em" }}>
          <SpeechBubble
            key={speech.nonce}
            text={speech.text}
            speedMs={speech.speed}
            playBlip={playBlip}
            onChar={() => setSpeechTick((n) => n + 1)}
            style={bubbleStyle}
            className={bubbleClassName}
          />
        </div>

        <Mascot
          cara={pose.cara}
          bigote={pose.bigote}
          manoIzquierda={pose.manoIzquierda}
          manoDerecha={pose.manoDerecha}
          manoIzquierdaAngulo={pose.manoIzquierdaAngulo}
          manoDerechaAngulo={pose.manoDerechaAngulo}
          alive={alive}
          cargando={cargando}
          speechTick={speechTick}
          size={size}
        />
      </div>
    );
  }
);

export default MascotAsistente;
