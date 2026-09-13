import { useState, type FormEvent } from "react";
import { setAccessKey } from "../net/accessKey";

export default function AccessGate({
  wrongKey,
  onSubmit,
}: {
  wrongKey: boolean;
  onSubmit: () => void;
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
    <div className="bn-profile-gate">
      <form className="bn-profile-card" onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
        <h1 className="bn-profile-card__title">Código de acceso</h1>
        <p className="bn-profile-card__desc">Esta demo es privada. Pide el código al equipo para entrar.</p>
        <div className="bn-profile-card__fields">
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
          {wrongKey && <p style={{ color: "var(--bn-red-deep)", fontSize: "0.875rem", margin: 0 }}>Código incorrecto. Intenta de nuevo.</p>}
          <button type="submit" className="bn-profile-card__submit">Entrar</button>
        </div>
      </form>
    </div>
  );
}
