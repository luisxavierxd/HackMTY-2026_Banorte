import { useState, type FormEvent, type KeyboardEvent } from "react";

interface HomeProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  onOpenSidebar: () => void;
}

const SUGGESTIONS = [
  "¿Cómo voy con mis ahorros este mes?",
  "Quiero pagar menos intereses en mi tarjeta",
  "Ayúdame a planear una meta de ahorro",
];

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12L20 4L14 20L11 13L4 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Pantalla de arranque estilo "Liquid Glass" (Figma frame 2011:4): mascota +
 *  título + input glass-pill, que ES el composer real de este estado — no
 *  decorativo. Reemplaza a Empty.tsx; ver
 *  docs/superpowers/specs/2026-09-12-landing-liquid-glass-design.md.
 *  Solo se muestra mientras no hay conversación activa (App.tsx). */
export default function Home({ onSend, disabled, onOpenSidebar }: HomeProps) {
  const [value, setValue] = useState("");

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <div className="bn-home">
      <button type="button" className="bn-home__menu" aria-label="Ver tu contexto" onClick={onOpenSidebar}>
        <MenuIcon />
      </button>

      <div className="bn-home__content">
        <h1 className="bn-home__title">Pregúntale a Banqui...</h1>

        {/* Chips de sugerencia (las mismas 3 de la pantalla anterior,
         *  Empty.tsx) restilizadas como glass-chips arriba del input — solo
         *  en escritorio, donde hay espacio junto al título grande. */}
        <div className="bn-home__chips">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="bn-home__chip"
              disabled={disabled}
              onClick={() => onSend(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <form className="bn-home__form" onSubmit={onSubmit}>
          <input
            className="bn-home__input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pregúntame sobre tus finanzas"
            disabled={disabled}
            aria-label="Mensaje para el asistente"
            autoFocus
          />
          <button
            type="submit"
            className="bn-home__send"
            disabled={disabled || value.trim() === ""}
            aria-label="Enviar mensaje"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
