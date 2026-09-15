import type { A2UIComponentProps } from "../types";

/**
 * Placeholder para BarChart, LineChart y ProgressRing.
 * La integración real con ECharts llega en la Tarea 3 (ChartHost + adapters).
 * Este componente solo garantiza que el catálogo se reconoce y no rompe el
 * árbol mientras tanto.
 */
interface ChartPlaceholderProps {
  title?: string;
  label?: string;
}

export default function ChartPlaceholder({ props }: A2UIComponentProps<ChartPlaceholderProps>) {
  const heading = props.title || props.label;
  return (
    <div className="bn-chart-placeholder">
      {heading && <p className="bn-chart-placeholder__title">{heading}</p>}
      <p className="bn-chart-placeholder__msg">Gráfica pendiente</p>
    </div>
  );
}
