import type { ChartAdapter, EChartsOption, FormatKind } from "../types";
import { animationConfig } from "../lib/motion";
import { pickLabel } from "../lib/labels";

interface BarItem {
  label?: string;
  value: number;
}

export interface BarChartProps {
  title?: string;
  series: BarItem[];
  format?: FormatKind;
  compare?: BarItem[];
  goal?: number;
  highlight?: string;
  orientation?: "vertical" | "horizontal";
}

export const barChart: ChartAdapter<BarChartProps> = {
  name: "BarChart",
  height: 220,
  isEmpty(props) {
    return !props.series || props.series.length === 0;
  },
  toOption(props, _data, ctx): EChartsOption {
    const fmt: FormatKind = props.format ?? "number";
    const horizontal = props.orientation === "horizontal";
    const anim = animationConfig(ctx);
    const categories = props.series.map((s, i) => pickLabel(s as unknown as Record<string, unknown>, i));

    const barColor = (label: string) =>
      props.highlight ? (label === props.highlight ? ctx.t.red : ctx.t.graySoft) : ctx.t.gray;

    const goalKey = horizontal ? "xAxis" : "yAxis";
    const mainSeries = {
      name: props.title ?? "valor",
      type: "bar",
      data: props.series.map((s, i) => ({
        value: s.value,
        itemStyle: { color: barColor(pickLabel(s as unknown as Record<string, unknown>, i)) },
      })),
      barMaxWidth: 22,
      barGap: props.compare?.length ? "-100%" : undefined,
      z: 2,
      markLine:
        props.goal !== undefined
          ? {
              symbol: "none",
              lineStyle: { type: "dashed", color: ctx.t.gray },
              label: { formatter: () => ctx.fmt(props.goal as number, fmt), color: ctx.t.mute },
              data: [{ [goalKey]: props.goal }],
            }
          : undefined,
      ...anim,
    };

    const series: Record<string, unknown>[] = [];
    if (props.compare?.length) {
      series.push({
        name: "referencia",
        type: "bar",
        data: props.compare.map((c) => c.value),
        barMaxWidth: 36,
        itemStyle: { color: ctx.t.graySoft, opacity: 0.5 },
        z: 1,
        ...anim,
      });
    }
    series.push(mainSeries);

    const valueAxis = {
      type: "value",
      splitLine: { lineStyle: { color: ctx.t.line } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: ctx.t.mute, formatter: (v: number) => ctx.fmt(v, fmt) },
    };
    const categoryAxis = {
      type: "category",
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: ctx.t.mute },
    };

    return {
      grid: { left: 8, right: 20, top: 20, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "line" },
        valueFormatter: (v: unknown) => ctx.fmt(Number(v), fmt),
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series,
    };
  },
};
