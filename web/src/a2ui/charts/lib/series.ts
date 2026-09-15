import { pointerGet } from "../../pointer";
import type { ChartTone } from "../types";

/** Forma de un item de `series` en LineChart (catalog.py: label/path/key/tone/emphasis). */
export interface LineSeriesSpec {
  label: string;
  path?: string;
  key?: string;
  tone?: ChartTone;
  emphasis?: boolean;
}

/** Resuelve `path` contra el data model. Nunca truena: si no hay nada, arreglo vacío. */
export function resolveSeriesPoints(spec: LineSeriesSpec, data: unknown): Record<string, unknown>[] {
  if (!spec.path) return [];
  const arr = pointerGet<Record<string, unknown>[]>(data, spec.path, []);
  return Array.isArray(arr) ? arr : [];
}

/** Valores numéricos de una serie, leyendo `key` (default "value") de cada punto. */
export function seriesValues(spec: LineSeriesSpec, data: unknown): number[] {
  const points = resolveSeriesPoints(spec, data);
  const key = spec.key ?? "value";
  return points.map((p) => Number(p[key]) || 0);
}

/** Categorías del eje X: toma la serie más larga y lee `xKey` de cada punto (o 1..N). */
export function xCategories(specs: LineSeriesSpec[], data: unknown, xKey?: string): (string | number)[] {
  let longest: Record<string, unknown>[] = [];
  for (const s of specs) {
    const pts = resolveSeriesPoints(s, data);
    if (pts.length > longest.length) longest = pts;
  }
  if (!xKey) return longest.map((_, i) => i + 1);
  return longest.map((p) => (p[xKey] as string | number) ?? "");
}
