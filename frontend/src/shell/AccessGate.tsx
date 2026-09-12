import { useState, type FormEvent } from "react";
import { setAccessKey } from "../net/accessKey";

/** Pantalla mínima de "código de acceso" — reemplaza a HTTP Basic Auth
 *  porque el popup nativo del navegador no porta a un WebView de app móvil.
 *  El backend es quien de verdad valida el código (AccessKeyMiddleware); aquí
 *  solo se guarda y se reintenta la conexión — por eso no hay validación
 *  local más allá de "no vacío". */
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
    <div className="bn-access-gate">
      <form className="bn-access-gate__card" onSubmit={handleSubmit}>
        <h1>Código de acceso</h1>
        <p>Esta demo es privada. Pide el código al equipo para entrar.</p>
        <input
          type="password"
          inputMode="text"
          autoFocus
          placeholder="Código de acceso"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {wrongKey && <p className="bn-access-gate__error">Código incorrecto. Intenta de nuevo.</p>}
        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}
