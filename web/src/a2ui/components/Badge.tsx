import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import type { Binding, Tone } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface BadgeProps {
  text?: Binding<string>;
  tone?: Tone;
}

export default function Badge({ props, ctx }: A2UIComponentProps<BadgeProps>) {
  const tone = props.tone ?? "neutral";
  const text = resolveBinding(props.text, ctx.data, "");
  return <span className={clsx("bn-badge", `bn-tone-${tone}`)}>{String(text)}</span>;
}
