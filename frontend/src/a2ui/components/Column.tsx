import { useContext } from "react";
import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import { SurfaceRevealContext, IsNestedColumnContext } from "../surfaceRevealContext";

interface ColumnProps {
  children?: string[];
  gap?: "none" | "sm" | "md" | "lg";
}

export default function Column({ props, ctx }: A2UIComponentProps<ColumnProps>) {
  const gap = props.gap ?? "md";
  const revealedCount = useContext(SurfaceRevealContext);
  const isNested = useContext(IsNestedColumnContext);

  const children = props.children ?? [];
  const visibleChildren = isNested || revealedCount >= 99
    ? children
    : children.slice(0, revealedCount);

  return (
    <IsNestedColumnContext.Provider value={true}>
      <div className={clsx("bn-col", `bn-gap-${gap}`)}>
        {ctx.renderChildren(visibleChildren)}
      </div>
    </IsNestedColumnContext.Provider>
  );
}
