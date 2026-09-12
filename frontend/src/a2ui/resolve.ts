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
