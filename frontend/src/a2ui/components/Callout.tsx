import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import type { Binding, Tone } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface CalloutProps {
  text?: Binding<string>;
  tone?: Tone;
}

/** Nota destacada corta: aclaración, advertencia, dato legal. No es una
 *  gráfica ni un dato — es una frase que el diseño no debe dejar pasar
 *  desapercibida (ej. "el CAT es una aproximación"). */
export default function Callout({ props, ctx }: A2UIComponentProps<CalloutProps>) {
  const tone = props.tone ?? "neutral";
  const text = resolveBinding(props.text, ctx.data, "");
  if (!text) return null;

  return (
    <div className={clsx("bn-callout", `bn-tone-${tone}`)} role="note">
      <span className="bn-callout__icon" aria-hidden="true" />
      <p className="bn-callout__text">{String(text)}</p>
    </div>
  );
}
