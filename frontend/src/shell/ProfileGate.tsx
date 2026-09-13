import { useState, type FormEvent } from "react";
import { setProfile, type UserProfile } from "../net/profile";
import PrivacyNotice from "./PrivacyNotice";

// Tope razonable para cantidades en MXN en una demo — 100 M de pesos para
// ahorros/inversión, 1 M mensual para ingresos/gastos. Evita que alguien
// ingrese un billón por error de tecla y el agente tome ese número en serio.
const MAX_MENSUAL = 999_999;
const MAX_TOTAL = 99_999_999;

// Letras válidas en nombres hispanohablantes: a-z, acentuadas, diéresis, ñ,
// más espacio, guión y apóstrofo (O'Brien, García-López, etc.).
const NOMBRE_CHARS = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ'' -]+$/;
const NOMBRE_TIENE_LETRA = /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/;

function validarNombre(v: string): string | undefined {
  const t = v.trim();
  if (t.length === 0) return undefined; // no mostrar error si aún no escribió nada
  if (t.length < 2) return "Ingresa al menos tu primer nombre";
  if (t.length > 50) return "Máximo 50 caracteres";
  if (!NOMBRE_TIENE_LETRA.test(t)) return "El nombre debe contener al menos una letra";
  if (!NOMBRE_CHARS.test(t)) return "Solo letras, espacios, guiones y apóstrofos";
  if (/\s{2,}/.test(t)) return "Evita espacios consecutivos";
  return undefined;
}

function validarMonto(v: string, max: number): string | undefined {
  if (v === "") return undefined; // vacío = 0, aceptable
  const n = Number(v);
  if (isNaN(n)) return "Ingresa un número válido";
  if (n < 0) return "El monto no puede ser negativo";
  if (n > max) return `¿Seguro? Ese monto parece muy alto — revísalo`;
  return undefined;
}

type Touched = Record<string, boolean>;

export default function ProfileGate({ onSubmit }: { onSubmit: () => void }) {
  const [nombre, setNombre] = useState("");
  const [ingresoMensual, setIngresoMensual] = useState("");
  const [ahorro, setAhorro] = useState("");
  const [inversion, setInversion] = useState("");
  const [gastosMensuales, setGastosMensuales] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  // Rastrea qué campos tocó el usuario para no mostrar errores prematuros
  const [touched, setTouched] = useState<Touched>({});

  const errores = {
    nombre: validarNombre(nombre),
    ingresoMensual: validarMonto(ingresoMensual, MAX_MENSUAL),
    ahorro: validarMonto(ahorro, MAX_TOTAL),
    inversion: validarMonto(inversion, MAX_TOTAL),
    gastosMensuales: validarMonto(gastosMensuales, MAX_MENSUAL),
  };

  const hayErrores = Object.values(errores).some(Boolean);
  const canSubmit = nombre.trim().length >= 2 && !hayErrores && accepted;

  function touch(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Marcar todos como tocados para mostrar errores pendientes
    setTouched({ nombre: true, ingresoMensual: true, ahorro: true, inversion: true, gastosMensuales: true });
    if (!canSubmit) return;
    const profile: UserProfile = {
      // Normalizar espacios extra en el nombre
      nombre: nombre.trim().replace(/\s+/g, " "),
      ingresoMensual: Math.max(0, Number(ingresoMensual) || 0),
      ahorro: Math.max(0, Number(ahorro) || 0),
      inversion: Math.max(0, Number(inversion) || 0),
      gastosMensuales: Math.max(0, Number(gastosMensuales) || 0),
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
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => touch("nombre")}
            className={touched.nombre && errores.nombre ? "bn-field__input--error" : undefined}
            maxLength={51}
            autoComplete="given-name"
          />
          {touched.nombre && errores.nombre && (
            <span className="bn-field__error" role="alert">{errores.nombre}</span>
          )}
        </label>

        <label className="bn-field">
          <span>Ingreso mensual</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max={MAX_MENSUAL}
            step="1"
            placeholder="$0"
            value={ingresoMensual}
            onChange={(e) => setIngresoMensual(e.target.value)}
            onBlur={() => touch("ingresoMensual")}
            className={touched.ingresoMensual && errores.ingresoMensual ? "bn-field__input--error" : undefined}
          />
          {touched.ingresoMensual && errores.ingresoMensual && (
            <span className="bn-field__error" role="alert">{errores.ingresoMensual}</span>
          )}
        </label>

        <label className="bn-field">
          <span>Cantidad ahorrada (saldo total hoy, no lo que ahorras al mes)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max={MAX_TOTAL}
            step="1"
            placeholder="$0"
            value={ahorro}
            onChange={(e) => setAhorro(e.target.value)}
            onBlur={() => touch("ahorro")}
            className={touched.ahorro && errores.ahorro ? "bn-field__input--error" : undefined}
          />
          {touched.ahorro && errores.ahorro && (
            <span className="bn-field__error" role="alert">{errores.ahorro}</span>
          )}
        </label>

        <label className="bn-field">
          <span>Cantidad invertida (saldo total hoy)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max={MAX_TOTAL}
            step="1"
            placeholder="$0"
            value={inversion}
            onChange={(e) => setInversion(e.target.value)}
            onBlur={() => touch("inversion")}
            className={touched.inversion && errores.inversion ? "bn-field__input--error" : undefined}
          />
          {touched.inversion && errores.inversion && (
            <span className="bn-field__error" role="alert">{errores.inversion}</span>
          )}
        </label>

        <label className="bn-field">
          <span>Gastos mensuales aproximados</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max={MAX_MENSUAL}
            step="1"
            placeholder="$0"
            value={gastosMensuales}
            onChange={(e) => setGastosMensuales(e.target.value)}
            onBlur={() => touch("gastosMensuales")}
            className={touched.gastosMensuales && errores.gastosMensuales ? "bn-field__input--error" : undefined}
          />
          {touched.gastosMensuales && errores.gastosMensuales && (
            <span className="bn-field__error" role="alert">{errores.gastosMensuales}</span>
          )}
        </label>

        <label className="bn-checkbox">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
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
