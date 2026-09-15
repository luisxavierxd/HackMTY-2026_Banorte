import { getCookie, setCookie, deleteCookie } from "./cookies";

/** Perfil que la persona declara al entrar a la demo — da contexto al
 *  agente (nombre, ingreso mensual, ahorro, inversión). Persiste 1 año en
 *  cookie para sobrevivir a cerrar el navegador ("parece" tener base de
 *  datos); solo "Salir y crear otro" lo borra. Ver notes/DEPLOY_RAILWAY.md
 *  y PrivacyNotice.tsx para el aviso legal que acompaña este uso de cookies. */
export interface UserProfile {
  nombre: string;
  ingresoMensual: number;
  /** Saldo YA ahorrado a hoy (stock), no cuánto ahorra al mes. */
  ahorro: number;
  /** Monto YA invertido a hoy (stock), no una aportación mensual. */
  inversion: number;
  /** Gasto fijo mensual aproximado — para que el agente no lo confunda con
   *  el gasto real que calculan las herramientas de simulación. */
  gastosMensuales: number;
  [key: string]: unknown;
}

const COOKIE_NAME = "bn-user-profile";
const DAYS = 365;

export function getProfile(): UserProfile | null {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.nombre === "string") return parsed as UserProfile;
    return null;
  } catch {
    return null;
  }
}

export function setProfile(profile: UserProfile): void {
  setCookie(COOKIE_NAME, JSON.stringify(profile), DAYS);
}

export function clearProfile(): void {
  deleteCookie(COOKIE_NAME);
}
