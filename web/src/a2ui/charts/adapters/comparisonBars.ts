import type { ChartAdapter, ChartTone, EChartsOption, FormatKind } from "../types";
import { toneColor } from "../lib/tone";
import { animationConfig } from "../lib/motion";
import { pickLabel, pickNumber } from "../lib/labels";

interface ComparisonCategory {
  label?: string;
  a?: number;
  b?: number;
}

export interface ComparisonBarsProps {
  title?: string;
  labelA?: string;
  labelB?: string;
  categories: ComparisonCategory[];
  toneB?: ChartTone;
  format?: FormatKind;
}

/** Dos escenarios lado a lado por categoría (ej. pago mínimo vs. fijo,
 *  ideal vs. real de la regla 50/30/20). A siempre es la referencia (gris),
 *  B lleva el tono de negocio (costo/ahorro) para que salte a la vista. */
export const comparisonBars: ChartAdapter<ComparisonBarsProps> = {
  name: "ComparisonBars",
  height: 240,
  isEmpty(props) {
    return !props.categories || props.categories.length === 0;
  },
  toOption(props, _data, ctx): EChartsOption {
    const fmt: FormatKind = props.format ?? "currency";
    const anim = animationConfig(ctx);
    const colorB = toneColor(props.toneB ?? "costo", ctx.t);
    const categories = props.categories.map((c, i) => pickLabel(c as unknown as Record<string, unknown>, i));

    return {
      grid: { left: 8, right: 20, top: 20, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "shadow" },
        valueFormatter: (v: unknown) => ctx.fmt(Number(v), fmt),
        backgroundColor: ctx.t.sidebarBg,
        borderColor: ctx.t.cardBorder,
        textStyle: { color: ctx.t.inkFull },
      },
      legend: {
        bottom: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: ctx.t.mute, fontSize: 12 },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: ctx.t.mute, interval: 0, fontSize: 11, overflow: "truncate", width: 90 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: ctx.t.line } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: ctx.t.mute, formatter: (v: number) => ctx.fmt(v, fmt) },
      },
      series: [
        {
          name: props.labelA ?? "Escenario A",
          type: "bar",
          data: props.categories.map((c) =>
            pickNumber(c as unknown as Record<string, unknown>, ["a", "valueA", "ideal", "value_a"])
          ),
          barMaxWidth: 22,
          itemStyle: { color: ctx.t.graySoft, borderRadius: [4, 4, 0, 0] },
          ...anim,
        },
        {
          name: props.labelB ?? "Escenario B",
          type: "bar",
          data: props.categories.map((c) =>
            pickNumber(c as unknown as Record<string, unknown>, ["b", "valueB", "real", "value_b"])
          ),
          barMaxWidth: 22,
          itemStyle: { color: colorB, borderRadius: [4, 4, 0, 0] },
          ...anim,
        },
      ],
    };
  },
};
