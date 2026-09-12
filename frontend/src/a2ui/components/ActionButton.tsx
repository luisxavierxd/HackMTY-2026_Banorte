import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import type { ActionRef } from "../../contract/a2ui";

interface ActionButtonProps {
  text: string;
  action: ActionRef;
  variant?: "primary" | "secondary" | "ghost";
  confirm?: string;
}

export default function ActionButton({ props, ctx }: A2UIComponentProps<ActionButtonProps>) {
  const variant = props.variant ?? "primary";

  function handleClick() {
    if (props.confirm && !window.confirm(props.confirm)) return;
    ctx.runAction(props.action);
  }

  return (
    <button type="button" className={clsx("bn-btn", `bn-btn--${variant}`)} onClick={handleClick}>
      {props.text}
    </button>
  );
}
