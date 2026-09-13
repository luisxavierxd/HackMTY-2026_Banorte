import { useState, type FormEvent, type KeyboardEvent } from "react";
import "./landing.css";

interface HomeProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const SUGGESTIONS = [
  "¿Cómo voy con mis ahorros este mes?",
  "Quiero pagar menos intereses en mi tarjeta",
  "Ayúdame a planear una meta de ahorro",
];

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
    <div className="bn-landing">
      {/* Columna izquierda: espacio reservado para Banqui (overlay fijo) */}
      <div className="bn-landing__left" aria-hidden="true">
        <div className="bn-landing__mascot-spacer" />
      </div>

      {/* Columna derecha: título + chips + input */}
      <div className="bn-landing__right">
        <h1 className="bn-landing__title">Pregúntale a Banqui…</h1>

        <div className="bn-landing__chips">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="bn-landing__chip"
              disabled={disabled}
              onClick={() => onSend(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <form className="bn-landing__form" onSubmit={onSubmit}>
          <input
            className="bn-landing__input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="¿En qué te ayudo?"
            disabled={disabled}
            aria-label="Mensaje para el asistente"
            autoFocus
          />
        </form>
      </div>
    </div>
  );
}
