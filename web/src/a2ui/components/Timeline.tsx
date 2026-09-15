import clsx from "clsx";
import type { A2UIComponentProps } from "../types";

interface TimelineStep {
  label: string;
  detail?: string;
  highlight?: boolean;
}

interface TimelineProps {
  title?: string;
  steps?: TimelineStep[];
}

/** Pasos/hitos discretos (ej. "mes 12: llevas pagado X"). No es una gráfica
 *  continua — para eso está LineChart. */
export default function Timeline({ props }: A2UIComponentProps<TimelineProps>) {
  const steps = props.steps ?? [];

  if (steps.length === 0) {
    return <p className="bn-empty-inline">Sin pasos disponibles.</p>;
  }

  return (
    <div className="bn-timeline">
      {props.title && <p className="bn-timeline__title">{props.title}</p>}
      <ol className="bn-timeline__list">
        {steps.map((step, i) => (
          <li key={i} className={clsx("bn-timeline__step", step.highlight && "bn-timeline__step--highlight")}>
            <span className="bn-timeline__marker" aria-hidden="true" />
            <div className="bn-timeline__body">
              <span className="bn-timeline__label">{step.label}</span>
              {step.detail && <span className="bn-timeline__detail">{step.detail}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
