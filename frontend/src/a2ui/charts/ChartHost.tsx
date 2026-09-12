import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart as ELine, BarChart as EBar, PieChart as EPie } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  GraphicComponent,
  MarkLineComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import type { ComponentNode } from "../../contract/a2ui";
import { isBindingRef, type Binding } from "../../contract/a2ui";
import type { RenderCtx } from "../types";
import { resolveBinding } from "../resolve";
import { CHART_ADAPTERS } from "./registry";
import type { FormatKind, Theme } from "./types";
import { formatNumber } from "./lib/format";
import { registerBanorteTheme } from "./echartsTheme";
import "./chart.css";

echarts.use([
  ELine,
  EBar,
  EPie,
  GridComponent,
  TooltipComponent,
  GraphicComponent,
  MarkLineComponent,
  LegendComponent, // PieChart y ComparisonBars usan `legend` en su option
  CanvasRenderer,
]);
registerBanorteTheme();

interface ChartHostProps {
  node: ComponentNode;
  data: unknown;
  ctx: RenderCtx;
}

/** Resuelve bindings de nivel superior (p.ej. ProgressRing.value/.caption).
 *  Las listas de series (BarChart/LineChart) son literales del catálogo y
 *  se resuelven adentro de cada adapter vía lib/series.ts. */
function resolveTopLevelProps(props: Record<string, unknown>, data: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = isBindingRef(value) ? resolveBinding(value as Binding, data) : value;
  }
  return out;
}

function readTheme(el: HTMLElement): Theme {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    red: v("--bn-red", "#EB0029"),
    redDeep: v("--bn-red-deep", "#B3001F"),
    redWash: v("--bn-red-wash", "rgba(235, 0, 41, 0.16)"),
    gray: v("--bn-gray", "#594948"),
    graySoft: v("--bn-gray-soft", "#B6ABA8"),
    ahorro: v("--bn-ahorro", "#0B7D72"),
    ahorroWash: v("--bn-ahorro-wash", "rgba(11, 125, 114, 0.14)"),
    line: v("--bn-line", "#E4DEDC"),
    ink: v("--bn-ink", "#241C1A"),
    mute: v("--bn-mute", "#6E625F"),
    surface: v("--bn-surface", "#FFFFFF"),
  };
}

/** Único componente React que toca ECharts. Cada gráfica es un adapter puro
 *  (./adapters/*) que sólo produce la `option`; aquí se monta/mide/anima. */
export default function ChartHost({ node, data }: ChartHostProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);

  const adapter = CHART_ADAPTERS[node.component];
  const props = resolveTopLevelProps(node.props, data);
  const isEmpty = adapter?.isEmpty?.(props, data) ?? false;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !adapter || isEmpty) {
      chartRef.current?.dispose();
      chartRef.current = null;
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fmt = (n: number, f?: FormatKind) => formatNumber(n, f);
    const t = readTheme(el);

    try {
      const option = adapter.toOption(props, data, { t, reducedMotion, width, fmt });
      if (!chartRef.current) chartRef.current = echarts.init(el, "banorte");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chartRef.current.setOption(option as any, { notMerge: true });
      chartRef.current.resize();
    } catch (err) {
      console.warn(`[a2ui] fallo al graficar "${node.component}"`, err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, node.component, JSON.stringify(props), data, width, isEmpty]);

  useEffect(() => () => chartRef.current?.dispose(), []);

  if (!adapter) {
    return (
      <div className="bn-chart-placeholder">
        <p className="bn-chart-placeholder__msg">Componente no soportado: {node.component}</p>
      </div>
    );
  }

  const height = typeof adapter.height === "function" ? adapter.height(props) : adapter.height ?? 220;
  const title = (props.title as string | undefined) ?? undefined;

  return (
    <div className="bn-chart">
      {title && <p className="bn-chart__title">{title}</p>}
      <div className="bn-chart__body" style={{ height }}>
        <div ref={canvasRef} className="bn-chart__canvas" />
        {isEmpty && <p className="bn-chart__empty">Sin datos suficientes todavía.</p>}
      </div>
    </div>
  );
}
