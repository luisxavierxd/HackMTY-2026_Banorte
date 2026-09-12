import * as echarts from "echarts/core";

/**
 * Tema base de ECharts para look & feel (fuentes, tooltip, splitLines).
 * Los colores por tono (costo/ahorro/neutral) NO viven aquí: los resuelve
 * cada adapter vía ctx.t (CSS custom properties leídas en ChartHost) para
 * que un cambio de marca no requiera tocar esta capa dos veces.
 * Estos hex son solo el fallback estático del tema registrado, reflejo de
 * design/tokens.css.
 */
let registered = false;

export function registerBanorteTheme(): void {
  if (registered) return;
  registered = true;
  echarts.registerTheme("banorte", {
    color: ["#EB0029", "#0B7D72", "#594948", "#B6ABA8"],
    textStyle: { fontFamily: "Instrument Sans, system-ui, sans-serif", color: "#241C1A" },
    categoryAxis: {
      axisLine: { lineStyle: { color: "#E4DEDC" } },
      axisTick: { show: false },
      axisLabel: { color: "#6E625F" },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#6E625F" },
      splitLine: { lineStyle: { color: "#E4DEDC" } },
    },
    line: { symbol: "circle", smooth: true },
    tooltip: {
      backgroundColor: "#FFFFFF",
      borderColor: "#E4DEDC",
      borderWidth: 1,
      textStyle: { color: "#241C1A" },
    },
  });
}
