import clsx from "clsx";
import type { A2UIComponentProps } from "../types";

interface RowProps {
  children?: string[];
  align?: "start" | "center" | "between";
}

export default function Row({ props, ctx }: A2UIComponentProps<RowProps>) {
  const align = props.align ?? "start";
  return <div className={clsx("bn-row", `bn-align-${align}`)}>{ctx.renderChildren(props.children)}</div>;
}
