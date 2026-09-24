/**
 * Las 6 tools del dominio de educación financiera, reimplementadas en TS.
 *
 * Son funciones PURAS: mismos argumentos -> misma salida, sin red ni estado
 * global. El estado sintético que el Python lee de `data/state.json` vive
 * aquí como constante (`store.ts`), congelado del SEED original.
 *
 * Contrato duro: la salida de cada tool debe ser numéricamente idéntica a la
 * del Python (tolerancia relativa 1e-9). Eso lo verifican los goldens —
 * ver scripts/export_tool_goldens.py y web/tests/goldens/.
 */

/** Toda tool recibe un objeto de args y devuelve un objeto serializable. */
export type ToolFn = (args: Record<string, unknown>) => Record<string, unknown>;

export interface ToolDefinition {
  /** Nombre corto, sin namespace (ej. "explicar_interes_compuesto"). */
  name: string;
  /** Nombre calificado como lo expone el harness (ej. "educacion_financiera__..."). */
  qualified: string;
  description: string;
  /** JSON Schema de entrada, igual al que sirve GET /a2ui/tools. */
  schema: Record<string, unknown>;
  /** Hints de `ToolAnnotations` del spec MCP, en paridad con el servidor Python. */
  annotations: ToolAnnotations;
  run: ToolFn;
}

/** Los 4 hints de comportamiento de `ToolAnnotations` (spec MCP → Tools). */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/**
 * Todas las tools son cálculos puros: no escriben estado, misma entrada da la
 * misma salida y no salen a la red. Igual que `READ_ONLY_CALC` en el Python.
 */
export const READ_ONLY_CALC: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const TOOL_NAMESPACE = "educacion_financiera";

export function qualify(name: string): string {
  return `${TOOL_NAMESPACE}__${name}`;
}

/** Redondeo a 2 decimales con el mismo comportamiento que `round(x, 2)` de Python. */
export function round2(n: number): number {
  return roundTo(n, 2);
}

/**
 * Python usa banker's rounding (half-to-even) en `round()`; JS usa half-away-
 * from-zero en `toFixed`. La diferencia aparece exactamente en los empates
 * (…x5), que en estas series salen seguido por los montos en centavos. Sin
 * esto los goldens fallan por 0.01 en filas sueltas.
 *
 * El empate se detecta sobre la expansión decimal EXACTA del double, no
 * escalando por 10^digits: esa multiplicación mete su propio error y produce
 * empates falsos. Caso real que lo destapó — `33333.33 * 0.5`:
 *
 *   valor exacto  16666.66500000000087…  -> Python redondea ARRIBA: 16666.67
 *   valor * 100   1666666.5 (exacto)     -> parecía empate -> daba 16666.66
 *
 * `toFixed` sí redondea contra el valor exacto, así que sirve para todo lo
 * que no es empate; el empate real se resuelve aparte con enteros (BigInt),
 * sin volver a tocar punto flotante.
 */
export function roundTo(n: number, digits: number): number {
  if (!Number.isFinite(n)) return n;
  const abs = Math.abs(n);
  // A partir de 1e21 `toFixed` cambia a notación exponencial y ya no hay
  // parte fraccionaria que redondear.
  if (abs >= 1e21) return n;

  // Margen suficiente para ver si después del dígito `digits+1` queda algo:
  // un empate exacto es un racional diádico y su expansión termina mucho
  // antes de este ancho.
  const wide = Math.min(digits + 18, 100);
  const s = abs.toFixed(wide);
  const dot = s.indexOf(".");
  const intPart = s.slice(0, dot);
  const frac = s.slice(dot + 1);
  const tail = frac.slice(digits);
  const isTie = tail[0] === "5" && !/[1-9]/.test(tail.slice(1));

  let out: number;
  if (isTie) {
    // Entero truncado en base 10, armado del string para no reintroducir
    // error: si es par se queda, si es impar sube uno (half-to-even).
    const truncated = BigInt(intPart + frac.slice(0, digits));
    const even = truncated % 2n === 0n ? truncated : truncated + 1n;
    out = Number(even) / 10 ** digits;
  } else {
    out = Number(abs.toFixed(digits));
  }
  // `+ 0` normaliza el -0 que sale de redondear negativos chicos
  return (n < 0 ? -out : out) + 0;
}
