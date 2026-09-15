/**
 * Anti-drift: cada golden calculado por el Python corre contra la
 * implementación TS de la misma tool.
 *
 * Es la mitad que vive en el navegador del mecanismo del §3 de la spec; la
 * otra es `scripts/export_tool_goldens.py --check` en CI. Si este test pasa,
 * las dos implementaciones del dominio siguen diciendo lo mismo.
 *
 * Comparación numérica con tolerancia RELATIVA de 1e-9, nunca igualdad de
 * floats: Python y JS no coinciden bit a bit en divisiones encadenadas, y
 * exigir igualdad exacta haría que el test fallara por ruido en vez de por
 * drift real.
 */
import { describe, expect, it } from "vitest";
import { runTool } from "../src/agent/tools";
import { qualify } from "../src/agent/tools/types";

import interesCompuesto from "./goldens/explicar_interes_compuesto.json";
import pagoMinimoVsFijo from "./goldens/comparar_pago_minimo_vs_fijo.json";
import metaAhorro from "./goldens/simular_meta_ahorro.json";
import cat from "./goldens/explicar_cat.json";
import inflacion from "./goldens/visualizar_inflacion.json";
import regla from "./goldens/regla_50_30_20.json";

interface Golden {
  tool: string;
  cases: { args: Record<string, unknown>; expected: unknown }[];
}

const GOLDENS: Golden[] = [
  interesCompuesto,
  pagoMinimoVsFijo,
  metaAhorro,
  cat,
  inflacion,
  regla,
] as Golden[];

const REL_TOLERANCE = 1e-9;

/** Ruta legible al punto exacto donde difieren, para que el fallo sea útil. */
function compare(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === "number") {
    expect(typeof actual, `${path}: se esperaba número`).toBe("number");
    const a = actual as number;
    if (!Number.isFinite(expected) || !Number.isFinite(a)) {
      expect(a, path).toBe(expected);
      return;
    }
    // Tolerancia relativa al tamaño del valor; para los cercanos a cero
    // (donde lo relativo no significa nada) cae a una absoluta chica.
    const scale = Math.max(Math.abs(expected), Math.abs(a), 1e-6);
    const diff = Math.abs(a - expected);
    expect(
      diff / scale,
      `${path}: esperado ${expected}, recibido ${a} (dif ${diff})`,
    ).toBeLessThanOrEqual(REL_TOLERANCE);
    return;
  }

  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path}: se esperaba arreglo`).toBe(true);
    const arr = actual as unknown[];
    expect(arr.length, `${path}: largo distinto`).toBe(expected.length);
    expected.forEach((v, i) => compare(arr[i], v, `${path}[${i}]`));
    return;
  }

  if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object", `${path}: se esperaba objeto`).toBe(true);
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    expect(Object.keys(a).sort(), `${path}: claves distintas`).toEqual(Object.keys(e).sort());
    for (const k of Object.keys(e)) compare(a[k], e[k], `${path}.${k}`);
    return;
  }

  // strings, booleanos, null: exactos. Incluye los textos de `explicacion`,
  // que llevan números formateados y son justo donde se cuela el drift.
  expect(actual, path).toBe(expected);
}

describe("goldens: TS vs Python", () => {
  for (const golden of GOLDENS) {
    describe(golden.tool, () => {
      golden.cases.forEach((testCase, i) => {
        const args = JSON.stringify(testCase.args);
        it(`caso ${i}: ${args}`, () => {
          const actual = runTool(qualify(golden.tool), testCase.args);
          compare(actual, testCase.expected, golden.tool);
        });
      });
    });
  }

  it("cubre las 6 tools del dominio", () => {
    expect(GOLDENS).toHaveLength(6);
  });
});
