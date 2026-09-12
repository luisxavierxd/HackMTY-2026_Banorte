import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import type { Binding, Tone } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface MetricCardProps {
  label: string;
  value?: Binding<string | number>;
  delta?: Binding<string | number>;
  tone?: Tone;
}

export default function MetricCard({ props, ctx }: A2UIComponentProps<MetricCardProps>) {
  const tone = props.tone ?? "neutral";
  const value = resolveBinding(props.value, ctx.data, "");
  const delta = props.delta !== undefined ? resolveBinding(props.delta, ctx.data, "") : "";

  return (
    <div className="bn-metric">
      <span className="bn-metric__label">{props.label}</span>
      <span className="bn-metric__value bn-amount">{String(value)}</span>
      {delta !== "" && delta !== undefined && delta !== null && (
        <span className={clsx("bn-badge", "bn-metric__delta", `bn-tone-${tone}`)}>{String(delta)}</span>
      )}
    </div>
  );
}
