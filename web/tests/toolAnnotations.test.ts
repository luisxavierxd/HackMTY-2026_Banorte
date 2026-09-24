/**
 * Paridad con `legacy/tests/test_tool_annotations.py`: cada tool portada
 * declara los 4 hints de `ToolAnnotations` del spec MCP como booleanos.
 */
import { describe, expect, it } from "vitest";
import { findTool } from "../src/agent/tools";

const TOOLS = [
  "explicar_interes_compuesto",
  "comparar_pago_minimo_vs_fijo",
  "simular_meta_ahorro",
  "explicar_cat",
  "visualizar_inflacion",
  "regla_50_30_20",
];

const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const;

describe("tool annotations", () => {
  it.each(TOOLS)("%s declara los 4 hints", (name) => {
    const tool = findTool(name);
    expect(tool).toBeDefined();
    for (const hint of HINTS) {
      expect(typeof tool!.annotations?.[hint]).toBe("boolean");
    }
  });
});
