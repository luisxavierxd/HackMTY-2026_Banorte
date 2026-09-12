import clsx from "clsx";
import type { A2UIComponentProps } from "../types";
import { isBindingRef, type ActionRef, type Binding } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface Option {
  id: string;
  label: string;
  caption?: string;
  value?: unknown;
  highlight?: boolean;
}

interface OptionListProps {
  options?: Option[];
  value?: Binding<unknown>;
  action?: ActionRef;
}

export default function OptionList({ props, ctx }: A2UIComponentProps<OptionListProps>) {
  const options = props.options ?? [];
  const selected = resolveBinding(props.value, ctx.data);
  const path = isBindingRef(props.value) ? props.value.path : undefined;

  function choose(opt: Option) {
    if (path) ctx.setLocal(path, opt.value ?? opt.id);
    ctx.runAction(props.action);
  }

  if (options.length === 0) {
    return <p className="bn-empty-inline">Sin opciones disponibles.</p>;
  }

  return (
    <div className="bn-optionlist" role="radiogroup">
      {options.map((opt) => {
        const optValue = opt.value ?? opt.id;
        const isSelected = selected !== undefined && selected !== null && selected === optValue;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={clsx(
              "bn-option",
              isSelected && "bn-option--selected",
              opt.highlight && "bn-option--highlight"
            )}
            onClick={() => choose(opt)}
          >
            <span className="bn-option__label">{opt.label}</span>
            {opt.caption && <span className="bn-option__caption">{opt.caption}</span>}
          </button>
        );
      })}
    </div>
  );
}
