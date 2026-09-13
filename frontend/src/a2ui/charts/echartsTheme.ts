import * as echarts from "echarts/core";

let registered = false;

export function registerBanorteTheme(): void {
  if (registered) return;
  registered = true;
  echarts.registerTheme("banorte", {
    color: ["#EB0029", "#1DD3B0", "#8A8494", "#F5A623"],
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Albert Sans, system-ui, sans-serif" },
    categoryAxis: {
      axisTick: { show: false },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
    },
    line: { symbol: "circle", smooth: true },
    tooltip: {
      borderWidth: 1,
    },
  });
}
