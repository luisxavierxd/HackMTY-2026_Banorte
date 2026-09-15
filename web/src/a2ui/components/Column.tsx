import { useContext } from "react";
import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import { SurfaceRevealContext, IsNestedColumnContext, ChartScaleContext } from "../surfaceRevealContext";

interface ColumnProps {
  children?: string[];
  gap?: "none" | "sm" | "md" | "lg";
}

// Componentes que no reciben la cápsula bento (van a ancho completo, sin fondo)
const NON_CARD = new Set(["Callout", "ActionButton", "Divider", "Text", "Badge", "Slider", "OptionList", "TextField"]);

/** Cuánto se aplastan las gráficas cuando hay en las dos filas del bento.
 *  El bento no crece — su alto es el del dashboard y así se queda — así que
 *  lo que cede es la gráfica. 0.72 es lo que hace que dos filas quepan en el
 *  alto de una sin que la curva deje de leerse. */
const STACKED_CHART_SCALE = 0.72;

export default function Column({ props, ctx }: A2UIComponentProps<ColumnProps>) {
  const gap = props.gap ?? "md";
  const revealedCount = useContext(SurfaceRevealContext);
  const isNested = useContext(IsNestedColumnContext);

  const children = props.children ?? [];
  const visibleChildren = isNested || revealedCount >= 99
    ? children
    : children.slice(0, revealedCount);

  // Root column: cada hijo card/row va en su propia bento cell
  if (!isNested) {
    const cardIds = visibleChildren.filter((id) => !NON_CARD.has(ctx.getComponentType(id) ?? ""));
    const utilIds = visibleChildren.filter((id) => NON_CARD.has(ctx.getComponentType(id) ?? ""));
    const n = Math.min(cardIds.length, 4);
    const bentoClass = n > 0 ? `bn-bento-${n}` : "bn-bento-1";

    // El grid es de 2 columnas a partir de bento-2, y bento-3 manda la tercera
    // celda a ancho completo: en los dos casos la fila es floor(i / 2).
    const rowsWithChart = new Set(
      cardIds.map((id, i) => (ctx.hasChartDescendant(id) ? Math.floor(i / 2) : -1)).filter((r) => r >= 0)
    );
    // Con gráficas en una sola fila el alto de siempre sobra; el problema
    // aparece cuando caen en las dos y la suma se pasa del bento.
    const chartScale = rowsWithChart.size > 1 ? STACKED_CHART_SCALE : 1;

    return (
      <IsNestedColumnContext.Provider value={true}>
        <ChartScaleContext.Provider value={chartScale}>
          <div className={clsx("bn-col", bentoClass)}>
            {cardIds.map((childId) => (
              <div key={childId} className="bn-bento-cell">
                {ctx.renderChildren([childId])}
              </div>
            ))}
            {utilIds.map((childId) => (
              <div key={childId} className="bn-bento-span">
                {ctx.renderChildren([childId])}
              </div>
            ))}
          </div>
        </ChartScaleContext.Provider>
      </IsNestedColumnContext.Provider>
    );
  }

  return (
    <IsNestedColumnContext.Provider value={true}>
      <div className={clsx("bn-col", `bn-gap-${gap}`)}>
        {ctx.renderChildren(visibleChildren)}
      </div>
    </IsNestedColumnContext.Provider>
  );
}
