import type { ChartAdapter, EChartsOption, FormatKind } from "../types";
import { animationConfig } from "../lib/motion";
import { pickLabel } from "../lib/labels";

interface PieSlice {
  label?: string;
  value: number;
}

export interface PieChartProps {
  title?: string;
  slices: PieSlice[];
  format?: FormatKind;
}

/** Paleta categórica derivada de los tokens de marca (nunca hex sueltos aquí). */
function slicePalette(t: import("../types").Theme): string[] {
  return [t.red, t.ahorro, t.gray, t.redDeep, t.graySoft, t.mute];
}

export const pieChart: ChartAdapter<PieChartProps> = {
  name: "PieChart",
  height: 240,
  isEmpty(props) {
    return !props.slices || props.slices.length === 0;
  },
  toOption(props, _data, ctx): EChartsOption {
    const fmt: FormatKind = props.format ?? "currency";
    const anim = animationConfig(ctx);
    const palette = slicePalette(ctx.t);
    const total = props.slices.reduce((sum, s) => sum + (Number(s.value) || 0), 0);

    return {
      tooltip: {
        trigger: "item",
        confine: true,
        valueFormatter: (v: unknown) => ctx.fmt(Number(v), fmt),
      },
      legend: {
        bottom: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: ctx.t.mute, fontSize: 12 },
      },
      series: [
        {
          type: "pie",
          radius: ["46%", "72%"],
          center: ["50%", "42%"],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: ctx.t.surface, borderWidth: 2, borderRadius: 4 },
          label: {
            show: true,
            formatter: (p: { name: string; value: number }) =>
              total ? `${p.name}\n${Math.round((p.value / total) * 100)}%` : p.name,
            color: ctx.t.mute,
            fontSize: 11,
          },
          data: props.slices.map((s, i) => ({
            name: pickLabel(s as unknown as Record<string, unknown>, i),
            value: Number(s.value) || 0,
            itemStyle: { color: palette[i % palette.length] },
          })),
          ...anim,
        },
      ],
    };
  },
};
