import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import type { ActionRef } from "../../contract/a2ui";

// Sin "confirm": el ActionButton YA ES la confirmación (ver la regla de
// OptionList/Slider/TextField, que nunca disparan su propia acción). Un
// window.confirm() encima es redundante y en apps móviles/WebViews puede no
// mostrarse o bloquear el botón por completo (visto en producción).
interface ActionButtonProps {
  text: string;
  action: ActionRef;
  variant?: "primary" | "secondary" | "ghost";
}

export default function ActionButton({ props, ctx }: A2UIComponentProps<ActionButtonProps>) {
  const variant = props.variant ?? "primary";

  function handleClick() {
    ctx.runAction(props.action, props.text);
  }

  return (
    <button type="button" className={clsx("bn-btn", `bn-btn--${variant}`)} onClick={handleClick}>
      {props.text}
    </button>
  );
}
