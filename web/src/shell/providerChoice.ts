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

/**
 * Qué CLI corre del otro lado del WebSocket.
 *
 * Para el navegador los cuatro son idénticos — se conecta al mismo harness de
 * la misma forma. Lo único que cambia es **qué comando le decimos a la persona
 * que corra**, porque cada CLI es un perfil distinto del harness.
 */
export type LocalCli = "claude_code" | "codex" | "cursor" | "antigravity";

export interface LocalCliInfo {
  id: LocalCli;
  label: string;
  /** Binario que tiene que estar en el PATH. */
  binary: string;
  /** Target del Makefile de `legacy/`. */
  target: string;
  /** Qué credencial necesita, o null si usa la sesión local. */
  needs: string | null;
  note: string;
}

export const LOCAL_CLIS: Record<LocalCli, LocalCliInfo> = {
  claude_code: {
    id: "claude_code",
    label: "Claude Code",
    binary: "claude",
    target: "demo-code",
    needs: null,
    note: "Usa tu suscripción ya logueada, sin API key.",
  },
  codex: {
    id: "codex",
    label: "Codex",
    binary: "codex",
    target: "demo-codex",
    needs: null,
    note: "Usa el login de ChatGPT de ~/.codex/auth.json.",
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    binary: "cursor-agent",
    target: "demo-cursor",
    needs: "CURSOR_API_KEY",
    note: "Requiere CURSOR_API_KEY en el entorno.",
  },
  antigravity: {
    id: "antigravity",
    label: "Antigravity",
    binary: "agy",
    target: "demo-agy",
    needs: null,
    note: "Usa tu cuenta de Google, sin API key.",
  },
};

export const DEFAULT_CLI: LocalCli = "claude_code";

export interface ProviderChoice {
  kind: ChoiceKind;
  /** Solo para `remote`. */
  url: string;
  /** Solo para `remote`. Protege un harness local, no es una credencial de nube. */
  accessCode: string;
  /** Solo para `remote`: qué CLI corre del otro lado. No cambia la conexión,
   *  solo las instrucciones que se muestran. */
  cli: LocalCli;
}

export const DEFAULT_CHOICE: ProviderChoice = {
  kind: "recorded",
  url: DEFAULT_REMOTE_URL,
  accessCode: "",
  cli: DEFAULT_CLI,
};

function isLocalCli(value: unknown): value is LocalCli {
  return typeof value === "string" && value in LOCAL_CLIS;
}

/** Comando que la persona corre en su máquina para levantar el harness. */
export function cliCommand(cli: LocalCli): string {
  return `git clone https://github.com/luisxavierxd/HackMTY-2026_Banorte
cd HackMTY-2026_Banorte/legacy && make ${LOCAL_CLIS[cli].target}`;
}

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
      cli: isLocalCli(obj.cli) ? obj.cli : DEFAULT_CLI,
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
