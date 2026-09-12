/**
 * El catálogo (catalog.py) documenta "label" como la clave de cada item de
 * un objectList (series, slices, categories), pero eso no se valida a nivel
 * de campo interno — el modelo a veces copia el nombre de campo de la tool
 * de origen en vez de remapear (ej. "grupo" en vez de "label", porque
 * regla_50_30_20 regresa `comparacion: [{grupo, ideal, real}, ...]`).
 * Sin esto, el eje/leyenda muestra "undefined" en vez de romper claramente.
 */
export function pickLabel(item: Record<string, unknown>, index: number): string {
  const candidate = item.label ?? item.name ?? item.grupo ?? item.categoria ?? item.concepto;
  return typeof candidate === "string" && candidate.trim() ? candidate : `#${index + 1}`;
}
