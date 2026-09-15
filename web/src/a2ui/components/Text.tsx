import clsx from "clsx";
import type { JSX } from "react";
import type { A2UIComponentProps } from "../types";
import type { Binding } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface TextProps {
  text?: Binding<string | number>;
  variant?: "h1" | "h2" | "body" | "caption" | "amount";
}

const TAGS: Record<NonNullable<TextProps["variant"]>, keyof JSX.IntrinsicElements> = {
  h1: "h1",
  h2: "h2",
  body: "p",
  caption: "p",
  amount: "p",
};

export default function Text({ props, ctx }: A2UIComponentProps<TextProps>) {
  const variant = props.variant ?? "body";
  const value = resolveBinding(props.text, ctx.data, "");
  const Tag = TAGS[variant];
  return (
    <Tag className={clsx("bn-text", `bn-text--${variant}`, variant === "amount" && "bn-amount")}>
      {value === undefined || value === null ? "" : String(value)}
    </Tag>
  );
}
