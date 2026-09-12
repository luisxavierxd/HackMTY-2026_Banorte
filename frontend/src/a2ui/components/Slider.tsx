import { useState } from "react";
import type { A2UIComponentProps } from "../types";
import { isBindingRef, type ActionRef, type Binding, type FormatKind } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value?: Binding<number>;
  format?: FormatKind;
  action?: ActionRef;
}

function formatValue(value: number, format?: FormatKind): string {
  if (format === "currency") {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(
      value
    );
  }
  if (format === "percent") {
    return new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
  }
  return new Intl.NumberFormat("es-MX").format(value);
}

export default function Slider({ props, ctx }: A2UIComponentProps<SliderProps>) {
  const path = isBindingRef(props.value) ? props.value.path : undefined;
  const resolved = resolveBinding(props.value, ctx.data, props.min);
  const numeric = typeof resolved === "number" ? resolved : Number(resolved) || props.min;
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? numeric;

  function onInput(next: number) {
    setDragging(next);
    if (path) ctx.setLocal(path, next);
  }

  function onCommit() {
    setDragging(null);
    ctx.runAction(props.action);
  }

  return (
    <label className="bn-slider">
      <span className="bn-slider__top">
        <span className="bn-slider__label">{props.label}</span>
        <span className="bn-slider__value bn-amount">{formatValue(shown, props.format)}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={shown}
        onChange={(e) => onInput(Number(e.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        onKeyUp={onCommit}
      />
    </label>
  );
}
