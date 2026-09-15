import { useState, type FormEvent, type KeyboardEvent } from "react";

interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
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

/** Bar inferior delgada de chat. Deshabilitada mientras el agente trabaja. */
export default function Composer({ onSend, disabled }: ComposerProps) {
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
    <form className="bn-composer" onSubmit={onSubmit}>
      <input
        className="bn-composer__input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Pregúntame sobre tus finanzas"
        disabled={disabled}
        aria-label="Mensaje para el asistente"
      />
      <button
        type="submit"
        className="bn-composer__send"
        disabled={disabled || value.trim() === ""}
        aria-label="Enviar mensaje"
      >
        <SendIcon />
      </button>
    </form>
  );
}
