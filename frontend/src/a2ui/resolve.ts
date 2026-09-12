import { isBindingRef, type Binding } from "../contract/a2ui";
import { pointerGet } from "./pointer";

/**
 * Resuelve una prop que puede ser un literal o un binding {"path": "/..."}.
 * Si el pointer no resuelve a nada, regresa `fallback` (estado vacío,
 * nunca truena el render).
 */
export function resolveBinding<T = unknown>(value: Binding<T> | undefined, data: unknown, fallback?: T): T {
  if (value === undefined) return fallback as T;
  if (isBindingRef(value)) {
    return pointerGet<T>(data, value.path, fallback as T);
  }
  return value as T;
}

/**
 * Como `resolveBinding`, pero recorre objetos y arreglos completos.
 *
 * Bug real: el prompt le dice al modelo que CUALQUIER prop puede ser un
 * binding `{"path": "..."}`, incluyendo campos dentro de un arreglo (ej.
 * `ComparisonBars.categories[].a`/`.b`, cada categoría con su propio path).
 * El resolver de nivel superior (antes usado en ChartHost) solo miraba las
 * claves de primer nivel de `props` — un binding dos niveles adentro (dentro
 * de un objeto dentro de un arreglo) nunca se resolvía, quedaba como
 * `{"path": "..."}" literal, y `pickNumber` lo trataba como "no es número"
 * -> 0. Resultado: barras invisibles y ejes rotos, sin ningún error visible.
 * Recorrer todo el árbol, sin importar la profundidad, es la única forma de
 * que esto no se rompa cada vez que un componente nuevo anide un binding.
 */
export function resolveDeep<T = unknown>(value: T, data: unknown): T {
  if (isBindingRef(value)) {
    return pointerGet(data, value.path, undefined) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveDeep(item, data)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveDeep(v, data);
    }
    return out as T;
  }
  return value;
}
