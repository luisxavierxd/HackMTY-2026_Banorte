import clsx from "clsx";
import type { A2UIComponentProps } from "../types";

interface ColumnProps {
  children?: string[];
  gap?: "none" | "sm" | "md" | "lg";
}

export default function Column({ props, ctx }: A2UIComponentProps<ColumnProps>) {
  const gap = props.gap ?? "md";
  return <div className={clsx("bn-col", `bn-gap-${gap}`)}>{ctx.renderChildren(props.children)}</div>;
}
