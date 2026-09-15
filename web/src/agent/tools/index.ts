/**
 * Registro de las 6 tools del dominio, con el mismo contrato que expone el
 * harness en `GET /a2ui/tools`: nombre calificado `educacion_financiera__x`,
 * descripción y JSON Schema de entrada.
 *
 * El ciclo del agente en el navegador (BrowserAgentEngine) le pasa estas
 * specs al proveedor y ejecuta `runTool` con lo que el modelo pida — el
 * modelo decide, el motor ejecuta. Misma frontera que en el Python.
 */
import {
  compararPagoMinimoVsFijo,
  explicarCat,
  explicarInteresCompuesto,
  regla503020,
  simularMetaAhorro,
  visualizarInflacion,
} from "./educacionFinanciera";
import { qualify, type ToolDefinition } from "./types";

function obj(properties: Record<string, unknown>): Record<string, unknown> {
  // Ninguna tool tiene argumentos obligatorios: todas traen default.
  return { type: "object", properties, required: [] };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "explicar_interes_compuesto",
    qualified: qualify("explicar_interes_compuesto"),
    description: "Simula cómo crece una deuda con interés compuesto mes a mes.",
    schema: obj({
      capital: { type: "number", default: 10000.0, description: "monto inicial de la deuda." },
      tasa_anual: {
        type: "number",
        default: 0.3,
        description: "tasa nominal anual (ej. 0.30 = 30%).",
      },
      meses: { type: "integer", default: 24, description: "horizonte de simulación." },
    }),
    run: (args) => explicarInteresCompuesto(args as never),
  },
  {
    name: "comparar_pago_minimo_vs_fijo",
    qualified: qualify("comparar_pago_minimo_vs_fijo"),
    description:
      "Compara pagar solo el mínimo vs. un pago fijo mayor en la tarjeta del cliente.",
    schema: obj({
      pago_fijo: {
        type: ["number", "null"],
        default: null,
        description: "pago mensual fijo a comparar. Si se omite, se usa 2× el mínimo.",
      },
    }),
    run: (args) => compararPagoMinimoVsFijo(args as never),
  },
  {
    name: "simular_meta_ahorro",
    qualified: qualify("simular_meta_ahorro"),
    description:
      "Simula cuánto ahorrar al mes para alcanzar una meta, con y sin rendimiento.",
    schema: obj({
      meta: { type: "number", default: 50000.0, description: "cantidad objetivo." },
      plazo_meses: {
        type: "integer",
        default: 12,
        description: "en cuántos meses quieres llegar.",
      },
      tasa_ahorro_anual: {
        type: "number",
        default: 0.08,
        description: "tasa de rendimiento anual esperada.",
      },
    }),
    run: (args) => simularMetaAhorro(args as never),
  },
  {
    name: "explicar_cat",
    qualified: qualify("explicar_cat"),
    description: "Explica qué es el CAT y por qué es mayor que la tasa de interés.",
    schema: obj({
      monto: { type: "number", default: 100000.0, description: "principal del crédito." },
      plazo_meses: { type: "integer", default: 12, description: "número de pagos." },
      tasa_anual: { type: "number", default: 0.289, description: "tasa nominal anual." },
      comision_apertura: {
        type: "number",
        default: 0.01,
        description: "proporción cobrada al inicio (ej. 0.01 = 1%).",
      },
      seguro_mensual: {
        type: "number",
        default: 150.0,
        description: "costo del seguro mensual asociado al crédito.",
      },
    }),
    run: (args) => explicarCat(args as never),
  },
  {
    name: "visualizar_inflacion",
    qualified: qualify("visualizar_inflacion"),
    description: "Muestra cómo la inflación reduce el poder adquisitivo del dinero.",
    schema: obj({
      monto: { type: "number", default: 10000.0, description: "cantidad actual." },
      anios: { type: "integer", default: 5, description: "horizonte en años." },
      inflacion_anual: {
        type: "number",
        default: 0.045,
        description: "tasa de inflación anual estimada.",
      },
    }),
    run: (args) => visualizarInflacion(args as never),
  },
  {
    name: "regla_50_30_20",
    qualified: qualify("regla_50_30_20"),
    description:
      "Aplica la regla 50/30/20 al ingreso del cliente y compara con su gasto real.",
    schema: obj({
      ingreso_mensual: {
        type: ["number", "null"],
        default: null,
        description: "ingreso del cliente. Si se omite, se toma del perfil.",
      },
    }),
    run: (args) => regla503020(args as never),
  },
];

const BY_NAME = new Map<string, ToolDefinition>();
for (const tool of TOOLS) {
  BY_NAME.set(tool.qualified, tool);
  BY_NAME.set(tool.name, tool); // tolera que el modelo omita el namespace
}

export function findTool(name: string): ToolDefinition | undefined {
  return BY_NAME.get(name);
}

/**
 * Ejecuta una tool por nombre (calificado o corto). Nunca lanza: un error se
 * devuelve como `{error}` para que el ciclo lo pueda mandar de regreso al
 * modelo, igual que hace `McpManager.call` en el Python.
 */
export function runTool(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const tool = findTool(name);
  if (!tool) return { error: `herramienta desconocida: ${name}` };
  try {
    return tool.run(args ?? {});
  } catch (exc) {
    return { error: exc instanceof Error ? exc.message : String(exc) };
  }
}

export { readStore } from "./store";
export * from "./types";
