import type { ChartAdapter } from "./types";
import { lineChart } from "./adapters/lineChart";
import { barChart } from "./adapters/barChart";
import { progressRing } from "./adapters/progressRing";

/** Nombre del catálogo (catalog.py) -> adapter de gráfica. Una línea por gráfica. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CHART_ADAPTERS: Record<string, ChartAdapter<any>> = {
  LineChart: lineChart,
  BarChart: barChart,
  ProgressRing: progressRing,
};
