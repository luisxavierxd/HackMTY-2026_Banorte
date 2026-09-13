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
  height: 180,
  isEmpty(props, data) {
    return !(props.series ?? []).some((s) => resolveSeriesPoints(s, data).length > 0);
  },
  toOption(props, data, ctx): EChartsOption {
    const fmt: FormatKind = props.format ?? "currency";
    const area = props.area ?? true;
    const annotateLast = props.annotateLast ?? true;
    const anim = animationConfig(ctx);
    const categories = xCategories(props.series, data, props.xKey);

    const series = props.series.map((s, idx) => {
      const values = seriesValues(s, data);
      const primary = idx === 0 || !!s.emphasis;
      const color = primary ? ctx.t.red : ctx.t.graySoft;
      const last = values[values.length - 1];

      return {
        name: s.label,
        type: "line",
        data: values,
        smooth: true,
        showSymbol: true,
        symbol: "circle",
        symbolSize: (_v: number, p: { dataIndex: number }) =>
          p.dataIndex === values.length - 1 ? (primary ? 8 : 5) : 0,
        lineStyle: { width: primary ? 3 : 1.5, color },
        itemStyle: { color },
        z: primary ? 3 : 1,
        areaStyle:
          area && primary
            ? {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: ctx.t.redWash },
                    { offset: 1, color: "transparent" },
                  ],
                },
              }
            : undefined,
        markPoint:
          primary && annotateLast && values.length
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
        backgroundColor: ctx.t.sidebarBg,
        borderColor: ctx.t.cardBorder,
        textStyle: { color: ctx.t.inkFull },
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
