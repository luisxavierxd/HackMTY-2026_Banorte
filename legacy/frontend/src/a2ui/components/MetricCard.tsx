import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import type { Binding, Tone } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface MetricCardProps {
  label: string;
  value?: Binding<string | number>;
  delta?: Binding<string | number>;
  caption?: Binding<string>;
  tone?: Tone;
}

function abbreviateAmount(v: string): string {
  const m = v.match(/^(-?)(\$?)(\d[\d,]*)(\.\d+)?(.*)$/);
  if (!m) return v;
  const [, sign, curr, intPart, , rest] = m;
  const n = Number(intPart.replace(/,/g, ""));
  if (isNaN(n) || n < 10_000) return v;
  const abbr = n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}${curr}${abbr}${rest}`;
}

export default function MetricCard({ props, ctx }: A2UIComponentProps<MetricCardProps>) {
  const tone = props.tone ?? "neutral";
  const rawValue = resolveBinding(props.value, ctx.data, "");
  const value = abbreviateAmount(String(rawValue));
  const delta = props.delta !== undefined ? resolveBinding(props.delta, ctx.data, "") : "";
  const caption = props.caption !== undefined ? resolveBinding(props.caption, ctx.data, "") : "";

  const bullets = (() => {
    if (!caption || caption === "") return [];
    const text = String(caption);
    return text.split(/(?<=\.)\s+/).map((s) => s.replace(/\.$/, "").trim()).filter(Boolean);
  })();

  return (
    <div className="bn-metric">
      <h3 className="bn-metric__title">{props.label}</h3>
      <span className="bn-metric__value bn-amount">{String(value)}</span>
      {delta !== "" && delta !== undefined && delta !== null && (
        <span className={clsx("bn-badge", "bn-metric__delta", `bn-tone-${tone}`)}>{String(delta)}</span>
      )}
      {bullets.length > 0 && (
        <ul className="bn-metric__bullets">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}
