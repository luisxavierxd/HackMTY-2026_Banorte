/**
 * El selector de proveedor. UN solo componente para dos lugares: la primera
 * pantalla (`ProviderGate`) y el popover del chip del sidebar
 * (`ProviderChip`). Duplicar el formulario sería garantizar que las dos
 * copias se separen.
 *
 * El orden de las opciones no es cosmético (§5): **"Ver sesión grabada" va
 * primero y preseleccionada**. Quien llega sin key tiene que poder ver la demo
 * corriendo en un clic; si la primera pantalla es un formulario de
 * credenciales, la mayoría se va.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PROVIDERS, type ProviderId } from "../provider";
import { DEFAULT_REMOTE_URL } from "../engine/RemoteWsEngine";
import {
  DEFAULT_CLI,
  LOCAL_CLIS,
  type ChoiceKind,
  type LocalCli,
  type ProviderChoice,
  clearKey,
  cliCommand,
  getKey,
  providerIdOf,
} from "./providerChoice";

interface Option {
  kind: ChoiceKind;
  label: string;
  /** Qué pide, en una palabra. Se pinta como chip a la derecha. */
  asks: string;
  note: string;
}

/** El orden importa: la que no pide credencial va primero. */
const OPTIONS: Option[] = [
  {
    kind: "recorded",
    label: "Ver sesión grabada",
    asks: "nada",
    note: "Respuestas pregrabadas con el harness real. Sin modelo en vivo.",
  },
  {
    kind: "anthropic",
    label: PROVIDERS.anthropic.label,
    asks: "API key",
    note: PROVIDERS.anthropic.note,
  },
  {
    kind: "gemini",
    label: PROVIDERS.gemini.label,
    asks: "API key",
    note: PROVIDERS.gemini.note,
  },
  {
    kind: "remote",
    label: "CLI local",
    asks: "URL + código",
    note: "Claude Code, Codex, Cursor o Antigravity corriendo en tu máquina.",
  },
];

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard bloqueado (http, permisos): el texto sigue seleccionable
    }
  }

  return (
    <div className="bn-copyblock">
      <pre className="bn-copyblock__code">{text}</pre>
      <button type="button" className="bn-copyblock__btn" onClick={copy}>
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export interface ProviderPickerProps {
  /** Elección actual, para preseleccionar. */
  value: ProviderChoice;
  onSubmit: (choice: ProviderChoice, apiKey: string) => void;
  /** Texto del botón principal. */
  submitLabel?: string;
  /**
   * Salta la lista y pide SOLO la key del proveedor ya elegido. Es lo que se
   * usa al recargar: el proveedor se recordó, la key no (§5).
   */
  keyOnly?: boolean;
  /** Muestra "Borrar key de esta sesión" — acción secundaria del popover (§6). */
  showClearKey?: boolean;
  onClearKey?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export default function ProviderPicker({
  value,
  onSubmit,
  submitLabel = "Entrar",
  keyOnly = false,
  showClearKey = false,
  onClearKey,
  onCancel,
  autoFocus = true,
}: ProviderPickerProps) {
  const [kind, setKind] = useState<ChoiceKind>(value.kind);
  const [url, setUrl] = useState(value.url || DEFAULT_REMOTE_URL);
  const [accessCode, setAccessCode] = useState(value.accessCode);
  const [cli, setCli] = useState<LocalCli>(value.cli ?? DEFAULT_CLI);
  const [apiKey, setApiKey] = useState(() => {
    const id = providerIdOf(value.kind);
    return id ? getKey(id) : "";
  });

  const providerId = providerIdOf(kind);

  // Al cambiar de proveedor se trae la key que YA esté en esta pestaña para
  // ese proveedor (si la hay), en vez de dejar el campo con la del anterior.
  function pick(next: ChoiceKind) {
    setKind(next);
    const id = providerIdOf(next);
    setApiKey(id ? getKey(id) : "");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (providerId && !apiKey.trim()) return;
    if (kind === "remote" && !url.trim()) return;
    onSubmit(
      { kind, url: url.trim() || DEFAULT_REMOTE_URL, accessCode: accessCode.trim(), cli },
      apiKey.trim(),
    );
  }

  function handleClearKey() {
    if (providerId) clearKey(providerId);
    setApiKey("");
    onClearKey?.();
  }

  const blocked = (providerId !== null && !apiKey.trim()) || (kind === "remote" && !url.trim());

  return (
    <form className="bn-picker" onSubmit={handleSubmit}>
      {!keyOnly && (
        <div className="bn-picker__options" role="radiogroup" aria-label="Con qué correr la demo">
          {OPTIONS.map((option) => {
            const active = option.kind === kind;
            return (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={active}
                className={`bn-picker__option${active ? " bn-picker__option--active" : ""}`}
                onClick={() => pick(option.kind)}
              >
                <span className="bn-picker__option-head">
                  <span className="bn-picker__option-label">{option.label}</span>
                  <span className="bn-picker__option-asks">{option.asks}</span>
                </span>
                <span className="bn-picker__option-note">{option.note}</span>
              </button>
            );
          })}
        </div>
      )}

      {providerId && (
        <div className="bn-picker__fields">
          <label className="bn-glass-field">
            <span className="bn-glass-field__label">API key de {PROVIDERS[providerId].label}</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              autoFocus={autoFocus}
              placeholder="Pega tu key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <p className="bn-picker__hint">
            Se guarda solo en esta pestaña y se borra al cerrarla. Nunca viaja a
            ningún servidor nuestro — este sitio no tiene backend.{" "}
            <a href={PROVIDERS[providerId].keyUrl} target="_blank" rel="noreferrer">
              Obtener una key
            </a>
          </p>
        </div>
      )}

      {kind === "remote" && (
        <div className="bn-picker__fields">
          <p className="bn-picker__hint">
            <strong>El navegador no puede ejecutar el CLI.</strong> Corres el
            harness en tu máquina y esta página se conecta a él.
          </p>

          <div className="bn-picker__clis" role="radiogroup" aria-label="Qué CLI vas a correr">
            {Object.values(LOCAL_CLIS).map((info) => (
              <button
                key={info.id}
                type="button"
                role="radio"
                aria-checked={cli === info.id}
                className={`bn-picker__cli${cli === info.id ? " bn-picker__cli--active" : ""}`}
                onClick={() => setCli(info.id)}
                title={info.note}
              >
                {info.label}
              </button>
            ))}
          </div>
          <p className="bn-picker__hint bn-picker__hint--tight">
            {LOCAL_CLIS[cli].note} Necesitas <code>{LOCAL_CLIS[cli].binary}</code> en el PATH.
          </p>

          <CopyBlock text={cliCommand(cli)} />
          <label className="bn-glass-field">
            <span className="bn-glass-field__label">URL del harness</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoFocus={autoFocus && keyOnly}
              placeholder={DEFAULT_REMOTE_URL}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label className="bn-glass-field">
            <span className="bn-glass-field__label">Código de acceso (si lo pusiste)</span>
            <input
              type="password"
              autoComplete="off"
              placeholder="Opcional"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
            />
          </label>
          <p className="bn-picker__hint">
            Usa <code>127.0.0.1</code>, no <code>localhost</code>: Chrome bloquea{" "}
            <code>ws://localhost</code> desde una página HTTPS como contenido
            mixto, y la IP de loopback sí pasa. Chrome también puede pedirte
            permiso de acceso a la red local la primera vez — acéptalo.
          </p>
        </div>
      )}

      <div className="bn-picker__actions">
        <button type="submit" className="bn-picker__submit" disabled={blocked}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="bn-picker__ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        {showClearKey && providerId && (
          <button type="button" className="bn-picker__ghost" onClick={handleClearKey}>
            Borrar key de esta sesión
          </button>
        )}
      </div>
    </form>
  );
}
