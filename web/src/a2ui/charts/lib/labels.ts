/**
 * El catálogo (catalog.py) documenta nombres de campo exactos para cada item
 * de un objectList (series, slices, categories), pero eso no se valida a
 * nivel de campo interno — el modelo a veces copia el nombre de campo de la
 * tool de origen, o inventa una variante razonable, en vez de usar el
 * nombre exacto (ej. "grupo" en vez de "label", "valueA"/"valueB" en vez de
 * "a"/"b"). Sin esto, el eje/leyenda/barras muestran "undefined" o
 * simplemente no dibujan nada, en vez de romper claramente.
 */
export function pickLabel(item: Record<string, unknown>, index: number): string {
  const candidate = item.label ?? item.name ?? item.grupo ?? item.categoria ?? item.concepto;
  return typeof candidate === "string" && candidate.trim() ? candidate : `#${index + 1}`;
}

/** Como pickLabel, pero para un valor numérico con variantes de nombre. */
export function pickNumber(item: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const v = item[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}
