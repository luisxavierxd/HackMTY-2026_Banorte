/**
 * Construye el motor activo a partir de la elección y lo cambia en caliente.
 *
 * Aquí vive la red de seguridad de la demo (§7): si el motor elegido no puede
 * correr un turno, se degrada a `recorded` con un **aviso no modal** y el
 * turno igual produce una pantalla. La demo nunca queda en blanco — es la
 * única garantía que no se negocia.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionMessage } from "../contract/events";
import { buildProvider } from "../provider";
import {
  getKey,
  providerIdOf,
  type ProviderChoice,
} from "../shell/providerChoice";
import { BrowserAgentEngine } from "./BrowserAgentEngine";
import { RecordedEngine } from "./RecordedEngine";
import { RemoteWsEngine } from "./RemoteWsEngine";
import { EngineUnreachable, type EngineStatus, type HarnessEvent, type TurnEngine } from "./types";

function build(choice: ProviderChoice): TurnEngine {
  const providerId = providerIdOf(choice.kind);
  if (providerId) {
    const key = getKey(providerId);
    return new BrowserAgentEngine(key ? buildProvider(providerId, key) : null);
  }
  if (choice.kind === "remote") {
    return new RemoteWsEngine({ url: choice.url, accessCode: choice.accessCode });
  }
  return new RecordedEngine();
}

function hasDispose(engine: TurnEngine): engine is TurnEngine & { dispose(): void } {
  return typeof (engine as { dispose?: unknown }).dispose === "function";
}

export interface UseEngine {
  engine: TurnEngine;
  status: EngineStatus;
  /** Aviso de degradación pendiente, o `null`. No es modal. */
  notice: string | null;
  dismissNotice: () => void;
  /** Corre un turno, cancelando el anterior si sigue en vuelo. */
  run: (
    input: { kind: "message"; text: string } | { kind: "action"; action: ActionMessage },
    onEvent: (event: HarnessEvent) => void,
  ) => Promise<void>;
  /** Cancela el turno en vuelo sin empezar otro. */
  cancel: () => void;
  reset: () => Promise<void>;
}

export function useEngine(choice: ProviderChoice): UseEngine {
  const engine = useMemo(() => build(choice), [choice]);
  const [status, setStatus] = useState<EngineStatus>(() => engine.status());
  const [notice, setNotice] = useState<string | null>(null);

  /** Se crea perezosamente: la mayoría de las sesiones nunca lo necesitan. */
  const fallbackRef = useRef<RecordedEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Al cambiar de motor: cortar el turno en vuelo y soltar el socket del
  // anterior. Sin esto el WS viejo sigue reconectando en segundo plano y sus
  // eventos se cuelan en la conversación del motor nuevo.
  useEffect(() => {
    setStatus(engine.status());
    setNotice(null);
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (hasDispose(engine)) engine.dispose();
    };
  }, [engine]);

  // `RemoteWsEngine` conecta en segundo plano; su `status()` cambia sin que
  // React se entere. Un sondeo corto mantiene el punto del chip honesto.
  useEffect(() => {
    if (engine.id !== "remote") return;
    const timer = setInterval(() => setStatus(engine.status()), 1000);
    return () => clearInterval(timer);
  }, [engine]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const run = useCallback<UseEngine["run"]>(
    async (input, onEvent) => {
      // El turno anterior se cancela, nunca se deja huérfano (§6).
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      const stream = (target: TurnEngine) =>
        input.kind === "message"
          ? target.send(input.text, { signal })
          : target.act(input.action, { signal });

      let produced = false;
      try {
        for await (const event of stream(engine)) {
          if (signal.aborted) return;
          produced = true;
          onEvent(event);
        }
        setStatus(engine.status());
      } catch (err) {
        if (signal.aborted) return;
        setStatus(engine.status());

        // Solo se degrada si el turno no alcanzó a producir nada. Si ya salió
        // media pantalla, reproducir una grabación encima confundiría más de
        // lo que ayuda.
        const recoverable = err instanceof EngineUnreachable || engine.id === "remote";
        if (!recoverable || produced) {
          onEvent({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }

        setNotice(
          engine.id === "remote"
            ? "No se pudo conectar con el harness local. Mostrando una sesión grabada."
            : "El proveedor no respondió. Mostrando una sesión grabada.",
        );
        fallbackRef.current ??= new RecordedEngine();
        try {
          for await (const event of stream(fallbackRef.current)) {
            if (signal.aborted) return;
            onEvent(event);
          }
        } catch {
          // `RecordedEngine` tiene su propio fallback embebido; si hasta eso
          // falla, lo único honesto es decirlo.
          onEvent({ type: "error", message: "No se pudo reproducir la sesión grabada." });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [engine],
  );

  const reset = useCallback(async () => {
    cancel();
    await engine.reset();
    await fallbackRef.current?.reset();
  }, [engine, cancel]);

  return {
    engine,
    status,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    run,
    cancel,
    reset,
  };
}
