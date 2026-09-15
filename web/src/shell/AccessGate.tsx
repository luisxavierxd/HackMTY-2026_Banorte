import { useState, type FormEvent, type ReactNode } from "react";
import { setAccessKey } from "../net/accessKey";

export default function AccessGate({
  wrongKey,
  onSubmit,
  mascot,
}: {
  wrongKey: boolean;
  onSubmit: () => void;
  mascot?: ReactNode;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setAccessKey(trimmed);
    onSubmit();
  }

  return (
    <div className="bn-access-screen">
      {mascot && <div className="bn-access-screen__mascot">{mascot}</div>}
      <form className="bn-access-card" onSubmit={handleSubmit}>
        <h1 className="bn-access-card__title">Código de acceso</h1>
        <p className="bn-access-card__desc">
          Esta demo es privada. Pide el código al equipo para entrar.
        </p>
        <label className="bn-glass-field">
          <input
            type="password"
            inputMode="text"
            autoFocus
            placeholder="Código de acceso"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        {wrongKey && (
          <p className="bn-access-card__error">Código incorrecto. Intenta de nuevo.</p>
        )}
        <button type="submit" className="bn-access-card__submit">
          Entrar
        </button>
      </form>
    </div>
  );
}
