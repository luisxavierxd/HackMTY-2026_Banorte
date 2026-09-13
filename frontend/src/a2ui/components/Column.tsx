import { useContext } from "react";
import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import { SurfaceRevealContext, IsNestedColumnContext } from "../surfaceRevealContext";

interface ColumnProps {
  children?: string[];
  gap?: "none" | "sm" | "md" | "lg";
}

// Componentes que no reciben la cápsula bento (van a ancho completo, sin fondo)
const NON_CARD = new Set(["Callout", "ActionButton", "Divider", "Text", "Badge"]);

export default function Column({ props, ctx }: A2UIComponentProps<ColumnProps>) {
  const gap = props.gap ?? "md";
  const revealedCount = useContext(SurfaceRevealContext);
  const isNested = useContext(IsNestedColumnContext);

  const children = props.children ?? [];
  const visibleChildren = isNested || revealedCount >= 99
    ? children
    : children.slice(0, revealedCount);

  // Root column: una sola tarjeta, máximo una gráfica
  if (!isNested) {
    let chartSeen = false;
    const filtered = visibleChildren.filter((id) => {
      const isCard = !NON_CARD.has(ctx.getComponentType(id) ?? "");
      if (isCard) {
        if (chartSeen) return false;
        chartSeen = true;
      }
      return true;
    });

    const cardIds = filtered.filter((id) => !NON_CARD.has(ctx.getComponentType(id) ?? ""));
    const utilIds = filtered.filter((id) => NON_CARD.has(ctx.getComponentType(id) ?? ""));

    return (
      <IsNestedColumnContext.Provider value={true}>
        <div className={clsx("bn-col", "bn-bento-1")}>
          {cardIds.length > 0 && (
            <div className="bn-bento-cell">
              {ctx.renderChildren(cardIds)}
            </div>
          )}
          {utilIds.map((childId) => (
            <div key={childId} className="bn-bento-span">
              {ctx.renderChildren([childId])}
            </div>
          ))}
        </div>
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
