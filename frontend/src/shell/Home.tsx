import { useState, type FormEvent, type KeyboardEvent } from "react";
import DotField from "./DotField";

interface HomeProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const SUGGESTIONS = [
  "¿Cómo voy con mis ahorros este mes?",
  "Quiero pagar menos intereses en mi tarjeta",
  "Ayúdame a planear una meta de ahorro",
];

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

export default function Home({ onSend, disabled }: HomeProps) {
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
      <DotField
        style={{ position: "absolute", inset: 0 }}
        dotRadius={1.5}
        dotSpacing={16}
        bulgeStrength={55}
        glowRadius={140}
        cursorRadius={480}
        bulgeOnly
        gradientFrom="rgba(235, 0, 41, 0.22)"
        gradientTo="rgba(120, 0, 20, 0.12)"
        glowColor="#0c0c10"
      />
      <div className="bn-home__content">
        <p className="bn-home__greeting">Bienvenido a Banky</p>
        <h1 className="bn-home__title">¿En qué te puedo ayudar?</h1>
        <p className="bn-home__subtitle">
          Tu asistente financiero inteligente, listo para analizar tus finanzas y ayudarte a tomar mejores decisiones.
        </p>

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
