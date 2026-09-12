import type { A2UIComponentProps } from "../types";
import { isBindingRef, type Binding } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface TextFieldProps {
  label: string;
  value?: Binding<string | number>;
  inputType?: "text" | "number" | "email";
  placeholder?: string;
}

export default function TextField({ props, ctx }: A2UIComponentProps<TextFieldProps>) {
  const path = isBindingRef(props.value) ? props.value.path : undefined;
  const resolved = resolveBinding(props.value, ctx.data, "");

  function onChange(next: string) {
    if (!path) return;
    // Number("") === 0: enviaría 0 al agente al limpiar el campo, confundiéndolo
    // con un valor válido. Se deja null para que el agente sepa que está vacío.
    if (props.inputType === "number") {
      ctx.setLocal(path, next === "" ? null : Number(next));
    } else {
      ctx.setLocal(path, next);
    }
  }

  return (
    <label className="bn-field">
      <span className="bn-field__label">{props.label}</span>
      <input
        className="bn-field__input"
        type={props.inputType ?? "text"}
        value={resolved === undefined || resolved === null ? "" : String(resolved)}
        placeholder={props.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
