/**
 * El chip de proveedor (§6). Va **arriba del bloque de perfil**, antes de
 * conversaciones: es lo primero de la columna del sidebar.
 *
 * Muestra proveedor · modelo · punto de estado. Click abre el mismo
 * `<ProviderPicker>` del gate en modo popover — no una copia del formulario.
 *
 * El modelo que pinta viene de lo que reportó `turn_end`, no de un estado
 * paralelo: es el dato que de verdad corrió el turno, así que no puede
 * desincronizarse de lo que la persona está viendo.
 */
import { useEffect, useRef } from "react";
import type { EngineStatus } from "../engine/types";
import ProviderPicker from "./ProviderPicker";
import type { ProviderChoice } from "./providerChoice";

const STATUS_LABEL: Record<EngineStatus, string> = {
  ready: "listo",
  "needs-credential": "falta credencial",
  unreachable: "inalcanzable",
};

export default function ProviderChip({
  choice,
  label,
  model,
  status,
  open,
  onToggle,
  onSubmit,
  onClearKey,
  className = "",
}: {
  choice: ProviderChoice;
  label: string;
  /** Modelo activo tal como lo reportó `turn_end`; vacío hasta el primer turno. */
  model: string;
  status: EngineStatus;
  open: boolean;
  onToggle: (open: boolean) => void;
  onSubmit: (choice: ProviderChoice, apiKey: string) => void;
  onClearKey: () => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera o con Escape: es un popover, no un modal —
  // no debe atrapar a la persona.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) onToggle(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onToggle(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onToggle]);

  return (
    <div className={`bn-chip-wrap ${className}`.trim()} ref={wrapRef}>
      <button
        type="button"
        className="bn-chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onToggle(!open)}
        title={`${label}${model ? ` · ${model}` : ""} — ${STATUS_LABEL[status]}`}
      >
        <span className={`bn-chip__dot bn-chip__dot--${status}`} aria-hidden="true" />
        <span className="bn-chip__text">
          <span className="bn-chip__label">{label}</span>
          {model && <span className="bn-chip__model">{model}</span>}
        </span>
        <span className="bn-chip__sr">{STATUS_LABEL[status]}</span>
      </button>

      {open && (
        <div className="bn-chip__popover" role="dialog" aria-label="Cambiar proveedor">
          <ProviderPicker
            value={choice}
            onSubmit={onSubmit}
            submitLabel="Cambiar"
            showClearKey
            onClearKey={onClearKey}
            onCancel={() => onToggle(false)}
            autoFocus={false}
          />
        </div>
      )}
    </div>
  );
}
