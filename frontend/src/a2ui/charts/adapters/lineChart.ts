import type { ChartAdapter, EChartsOption, FormatKind } from "../types";
import type { LineSeriesSpec } from "../lib/series";
import { resolveSeriesPoints, seriesValues, xCategories } from "../lib/series";
import { toneColor, toneWash } from "../lib/tone";
import { animationConfig } from "../lib/motion";

export interface LineChartProps {
  title?: string;
  series: LineSeriesSpec[];
  xKey?: string;
  xLabel?: string;
  format?: FormatKind;
  area?: boolean;
  annotateLast?: boolean;
}

export const lineChart: ChartAdapter<LineChartProps> = {
  name: "LineChart",
  height: 240,
  isEmpty(props, data) {
    return !(props.series ?? []).some((s) => resolveSeriesPoints(s, data).length > 0);
  },
  toOption(props, data, ctx): EChartsOption {
    const fmt: FormatKind = props.format ?? "currency";
    const area = props.area ?? true;
    const annotateLast = props.annotateLast ?? true;
    const anim = animationConfig(ctx);
    const categories = xCategories(props.series, data, props.xKey);

    const series = props.series.map((s) => {
      const values = seriesValues(s, data);
      const emphasis = !!s.emphasis;
      const color = emphasis ? toneColor(s.tone, ctx.t) : ctx.t.graySoft;
      const last = values[values.length - 1];

      return {
        name: s.label,
        type: "line",
        data: values,
        smooth: true,
        showSymbol: true,
        symbol: "circle",
        // Sin símbolos salvo en el último punto de la serie.
        symbolSize: (_v: number, p: { dataIndex: number }) =>
          p.dataIndex === values.length - 1 ? (emphasis ? 8 : 5) : 0,
        lineStyle: { width: emphasis ? 3 : 1.5, color },
        itemStyle: { color },
        z: emphasis ? 3 : 1,
        areaStyle:
          area && emphasis
            ? {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: toneWash(s.tone, ctx.t) },
                    { offset: 1, color: "transparent" },
                  ],
                },
              }
            : undefined,
        markPoint:
          emphasis && annotateLast && values.length
            ? {
                symbol: "circle",
                symbolSize: 34,
                itemStyle: { color },
                label: { color: "#fff", fontSize: 11, fontWeight: 600, formatter: () => ctx.fmt(last, fmt) },
                data: [{ coord: [values.length - 1, last] }],
              }
            : undefined,
        ...anim,
      };
    });

    return {
      grid: { left: 8, right: 20, top: 20, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "line" },
        valueFormatter: (v: unknown) => ctx.fmt(Number(v), fmt),
      },
      xAxis: {
        type: "category",
        data: categories,
        name: props.xLabel,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: ctx.t.mute },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: ctx.t.line } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: ctx.t.mute, formatter: (v: number) => ctx.fmt(v, fmt) },
      },
      series,
    };
  },
};
