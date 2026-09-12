import type { Envelope, Surface } from "../contract/a2ui";
import { pointerSet } from "./pointer";

export type SurfaceState = Surface | null;

function emptySurface(id: string): Surface {
  return { id, root: undefined, components: {}, data: {} };
}

/** Aplica una tanda de envelopes A2UI en orden, produciendo el siguiente estado. */
export function applyEnvelopes(state: SurfaceState, envelopes: Envelope[]): SurfaceState {
  let next = state;
  for (const env of envelopes) {
    next = applyOne(next, env);
  }
  return next;
}

function applyOne(state: SurfaceState, env: Envelope): SurfaceState {
  if ("createSurface" in env) {
    return emptySurface(env.createSurface.surfaceId);
  }

  if (!state) {
    // Defensivo: un update sin createSurface previo no debe tronar el render.
    if ("updateDataModel" in env) return emptySurface(env.updateDataModel.surfaceId);
    if ("updateComponents" in env) return emptySurface(env.updateComponents.surfaceId);
    return state;
  }

  if ("updateDataModel" in env) {
    const base: Record<string, unknown> =
      typeof state.data === "object" && state.data !== null && !Array.isArray(state.data)
        ? { ...(state.data as Record<string, unknown>) }
        : {};
    const data = pointerSet(base, env.updateDataModel.path, env.updateDataModel.value);
    return { ...state, data };
  }

  if ("updateComponents" in env) {
    const components = { ...state.components };
    for (const node of env.updateComponents.components) {
      components[node.id] = node;
    }
    // El root es el primer componente de la lista recibida (contrato del backend).
    const root = env.updateComponents.components[0]?.id ?? state.root;
    return { ...state, components, root };
  }

  if ("deleteSurface" in env) {
    return null;
  }

  return state;
}
