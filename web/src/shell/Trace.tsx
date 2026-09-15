import { useEffect, useState } from "react";

export type TraceStatus =
  | { kind: "idle" }
  | { kind: "tool_call"; name: string; ts: number }
  | { kind: "thinking"; text: string; ts: number }
  | { kind: "action"; name: string; ts: number }
  | { kind: "done"; latencyMs: number; provider: string; model: string };

/** Nombre de tool MCP (mcp_servers/educacion_financiera) -> frase humana. */
const TOOL_PHRASES: Record<string, string> = {
  explicar_interes_compuesto: "Calculando interés compuesto…",
  comparar_pago_minimo_vs_fijo: "Comparando pago mínimo vs. pago fijo…",
  simular_meta_ahorro: "Simulando tu meta de ahorro…",
  explicar_cat: "Desglosando el CAT…",
  visualizar_inflacion: "Midiendo el efecto de la inflación…",
  regla_50_30_20: "Aplicando la regla 50/30/20…",
};

function humanizeTool(qualifiedName: string): string {
  const short = qualifiedName.split("__").pop() ?? qualifiedName;
  if (TOOL_PHRASES[short]) return TOOL_PHRASES[short];
  return `Consultando ${short.replace(/_/g, " ")}…`;
}

const FALLBACK_AFTER_MS = 6000;
const FALLBACK_TEXT = "Sigo revisando tus números…";

interface TraceProps {
  status: TraceStatus;
}

/** Línea única que muda de texto según lo que el agente esté haciendo. */
export default function Trace({ status }: TraceProps) {
  const [stale, setStale] = useState(false);
  const activityKey =
    status.kind === "tool_call" || status.kind === "thinking" || status.kind === "action" ? status.ts : null;

  useEffect(() => {
    setStale(false);
    if (activityKey === null) return;
    const timer = setTimeout(() => setStale(true), FALLBACK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [activityKey]);

  if (status.kind === "idle") return null;

  if (status.kind === "done") {
    return (
      <div className="bn-trace bn-trace--done">
        <span>
          {status.latencyMs} ms · {status.model || status.provider}
        </span>
      </div>
    );
  }

  let text: string;
  if (status.kind === "tool_call") text = humanizeTool(status.name);
  else if (status.kind === "action") text = "Procesando tu acción…";
  else text = status.text;

  return (
    <div className="bn-trace" role="status" aria-live="polite">
      <span className="bn-trace__dot" aria-hidden="true" />
      <span className="bn-trace__text">{stale ? FALLBACK_TEXT : text}</span>
    </div>
  );
}
