/**
 * Qué motor corre la demo y con qué credencial.
 *
 * La regla que gobierna este archivo (§7 de la spec):
 *
 *   La ELECCIÓN se recuerda.  La CREDENCIAL no.
 *
 * - El proveedor elegido y, para `remote`, la URL y el código de acceso viven
 *   en `localStorage`: sobreviven a cerrar el navegador. Ninguno de los dos es
 *   secreto — la URL es `127.0.0.1` y el código protege un harness local.
 * - Las **API keys viven en `sessionStorage`**, nunca en `localStorage`, nunca
 *   en la URL ni en un query param, y nunca se escriben a consola ni a
 *   telemetría. Al cerrar la pestaña se van. Es la contraparte honesta de
 *   pedirle a alguien que pegue su key en una página ajena.
 *
 * Al recargar, si el proveedor recordado necesita key, el gate vuelve **solo
 * para la key** — no se re-pregunta el proveedor.
 */
import type { ProviderId } from "../provider";
import { DEFAULT_REMOTE_URL } from "../engine/RemoteWsEngine";

/** Qué eligió la persona. `recorded` es el default: funciona sin escribir nada. */
export type ChoiceKind = "recorded" | "anthropic" | "gemini" | "remote";

export interface ProviderChoice {
  kind: ChoiceKind;
  /** Solo para `remote`. */
  url: string;
  /** Solo para `remote`. Protege un harness local, no es una credencial de nube. */
  accessCode: string;
}

export const DEFAULT_CHOICE: ProviderChoice = {
  kind: "recorded",
  url: DEFAULT_REMOTE_URL,
  accessCode: "",
};

const CHOICE_KEY = "bn-provider-choice";
/** Prefijo en sessionStorage. Una key por proveedor: cambiar de Anthropic a
 *  Gemini y volver no obliga a re-pegar la primera dentro de la misma pestaña. */
const KEY_PREFIX = "bn-provider-key:";

/** `kind` que corresponde a un proveedor de API, o `null` para los otros dos. */
export function providerIdOf(kind: ChoiceKind): ProviderId | null {
  return kind === "anthropic" || kind === "gemini" ? kind : null;
}

export function needsApiKey(kind: ChoiceKind): boolean {
  return providerIdOf(kind) !== null;
}

function isChoiceKind(value: unknown): value is ChoiceKind {
  return value === "recorded" || value === "anthropic" || value === "gemini" || value === "remote";
}

// Todo acceso va envuelto: en modo privado o con cookies de sitio bloqueadas
// el solo hecho de leer `localStorage` lanza. La demo debe seguir corriendo.

export function getChoice(): ProviderChoice {
  try {
    const raw = localStorage.getItem(CHOICE_KEY);
    if (!raw) return { ...DEFAULT_CHOICE };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_CHOICE };
    const obj = parsed as Record<string, unknown>;
    if (!isChoiceKind(obj.kind)) return { ...DEFAULT_CHOICE };
    return {
      kind: obj.kind,
      url: typeof obj.url === "string" && obj.url ? obj.url : DEFAULT_REMOTE_URL,
      accessCode: typeof obj.accessCode === "string" ? obj.accessCode : "",
    };
  } catch {
    return { ...DEFAULT_CHOICE };
  }
}

export function setChoice(choice: ProviderChoice): void {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // sin persistencia la elección dura lo que dure la pestaña — aceptable
  }
}

export function getKey(provider: ProviderId): string {
  try {
    return sessionStorage.getItem(KEY_PREFIX + provider) ?? "";
  } catch {
    return "";
  }
}

export function setKey(provider: ProviderId, key: string): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + provider, key);
  } catch {
    // ídem: el turno en curso igual puede correr, solo no se recuerda
  }
}

export function clearKey(provider: ProviderId): void {
  try {
    sessionStorage.removeItem(KEY_PREFIX + provider);
  } catch {
    /* nada que borrar si nunca se pudo guardar */
  }
}

export function clearAllKeys(): void {
  try {
    for (const id of ["anthropic", "gemini"] as const) {
      sessionStorage.removeItem(KEY_PREFIX + id);
    }
  } catch {
    /* ídem */
  }
}

/** ¿Esta elección puede correr ya, o le falta algo? */
export function isChoiceReady(choice: ProviderChoice): boolean {
  const provider = providerIdOf(choice.kind);
  if (provider) return getKey(provider).length > 0;
  if (choice.kind === "remote") return choice.url.trim().length > 0;
  return true;
}

/** Nombre visible, para el chip y el separador del transcript. */
export function labelOf(choice: ProviderChoice, providers: Record<ProviderId, { label: string }>): string {
  const provider = providerIdOf(choice.kind);
  if (provider) return providers[provider].label;
  return choice.kind === "remote" ? "CLI local" : "Sesión grabada";
}
