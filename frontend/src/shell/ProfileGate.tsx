import { useState, type FormEvent } from "react";
import { setProfile, type UserProfile } from "../net/profile";
import PrivacyNotice from "./PrivacyNotice";

/** Segundo paso del "login" de la demo (el primero es AccessGate): pide el
 *  perfil que da contexto al agente. Vive aquí, no en una pantalla aparte
 *  del resto de la app, porque el usuario pidió explícitamente que todo
 *  quede dentro del flujo de entrada de la demo. */
export default function ProfileGate({ onSubmit }: { onSubmit: () => void }) {
  const [nombre, setNombre] = useState("");
  const [ingresoMensual, setIngresoMensual] = useState("");
  const [ahorro, setAhorro] = useState("");
  const [inversion, setInversion] = useState("");
  const [gastosMensuales, setGastosMensuales] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const canSubmit = nombre.trim().length > 0 && accepted;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const profile: UserProfile = {
      nombre: nombre.trim(),
      ingresoMensual: Number(ingresoMensual) || 0,
      ahorro: Number(ahorro) || 0,
      inversion: Number(inversion) || 0,
      gastosMensuales: Number(gastosMensuales) || 0,
    };
    setProfile(profile);
    onSubmit();
  }

  if (showPrivacy) {
    return (
      <div className="bn-access-gate">
        <div className="bn-access-gate__card bn-access-gate__card--wide">
          <PrivacyNotice />
          <button type="button" onClick={() => setShowPrivacy(false)}>
            Entendido, regresar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bn-access-gate">
      <form className="bn-access-gate__card" onSubmit={handleSubmit}>
        <h1>Cuéntanos de ti</h1>
        <p>
          Esto le da contexto al asistente para personalizar la conversación.
          Se guarda solo en tu navegador — puedes borrarlo cuando quieras.
        </p>
        <label className="bn-field">
          <span>Nombre</span>
          <input
            type="text"
            autoFocus
            placeholder="¿Cómo te llamas?"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
          />
        </label>
        <label className="bn-field">
          <span>Ingreso mensual</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="$0"
            value={ingresoMensual}
            onChange={(event) => setIngresoMensual(event.target.value)}
          />
        </label>
        <label className="bn-field">
          <span>Cantidad ahorrada (saldo total hoy, no lo que ahorras al mes)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="$0"
            value={ahorro}
            onChange={(event) => setAhorro(event.target.value)}
          />
        </label>
        <label className="bn-field">
          <span>Cantidad invertida (saldo total hoy)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="$0"
            value={inversion}
            onChange={(event) => setInversion(event.target.value)}
          />
        </label>
        <label className="bn-field">
          <span>Gastos mensuales aproximados</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="$0"
            value={gastosMensuales}
            onChange={(event) => setGastosMensuales(event.target.value)}
          />
        </label>
        <label className="bn-checkbox">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>
            Acepto el{" "}
            <button type="button" className="bn-link" onClick={() => setShowPrivacy(true)}>
              Aviso de Privacidad
            </button>
          </span>
        </label>
        <button type="submit" disabled={!canSubmit}>
          Empezar
        </button>
      </form>
    </div>
  );
}
