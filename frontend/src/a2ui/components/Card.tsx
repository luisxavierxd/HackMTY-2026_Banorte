import clsx from "clsx";
import type { A2UIComponentProps } from "../types";

interface CardProps {
  child?: string;
  title?: string;
  variant?: "default" | "highlight";
}

export default function Card({ props, ctx }: A2UIComponentProps<CardProps>) {
  const variant = props.variant ?? "default";
  return (
    <section className={clsx("bn-card", variant === "highlight" && "bn-card--highlight")}>
      {props.title && <h3 className="bn-card__title">{props.title}</h3>}
      <div className="bn-card__body">{ctx.renderChild(props.child)}</div>
    </section>
  );
}
