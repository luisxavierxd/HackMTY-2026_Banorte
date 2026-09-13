import * as echarts from "echarts/core";

let registered = false;

export function registerBanorteTheme(): void {
  if (registered) return;
  registered = true;
  echarts.registerTheme("banorte", {
    color: ["#EB0029", "#1DD3B0", "#8A8494", "#F5A623"],
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Instrument Sans, system-ui, sans-serif", color: "#EEEDF2" },
    categoryAxis: {
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.10)" } },
      axisTick: { show: false },
      axisLabel: { color: "rgba(255,255,255,0.50)" },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "rgba(255,255,255,0.50)" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
    },
    line: { symbol: "circle", smooth: true },
    tooltip: {
      backgroundColor: "rgba(18,16,22,0.88)",
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      textStyle: { color: "#EEEDF2" },
    },
  });
}
