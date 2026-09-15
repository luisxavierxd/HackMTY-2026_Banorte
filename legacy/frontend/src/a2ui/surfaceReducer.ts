import type { ComponentNode, Envelope, Surface } from "../contract/a2ui";
import { pointerSet } from "./pointer";

export type SurfaceState = Surface | null;

/**
 * El composer real (src/harness/a2ui/composer.py) emite cada componente con
 * las props PEGADAS al nivel de arriba del nodo, no anidadas bajo "props":
 *   {"id": "root", "component": "Column", "children": [...], "gap": "md"}
 * Los fixtures escritos a mano (frontend/src/lab/fixtures/*.json) sí las
 * anidan bajo "props". Aceptamos ambas formas aquí, en un solo lugar, para
 * que el resto del renderer (registry.tsx, ChartHost.tsx, cada componente)
 * pueda seguir asumiendo `node.props` siempre anidado.
 *
 * Bug real de producción: sin esto, `node.props` es `undefined` para TODO
 * componente que venga de un turno real (nunca se detectó antes porque solo
 * se había probado end-to-end con fixtures, que ya vienen anidados).
 */
function normalizeNode(raw: Record<string, unknown>): ComponentNode {
  const { id, component, props, ...rest } = raw;
  return {
    id: id as string,
    component: component as string,
    props: (props as Record<string, unknown> | undefined) ?? rest,
  };
}

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
    // Clon profundo: pointerSet muta objetos anidados in-place; sin esto,
    // el mismo objeto nested queda compartido entre la entrada nueva del
    // data model y las entradas anteriores del transcript, corrompiendo el
    // historial de conversación al restaurar un turno anterior.
    const base: Record<string, unknown> =
      typeof state.data === "object" && state.data !== null && !Array.isArray(state.data)
        ? (JSON.parse(JSON.stringify(state.data)) as Record<string, unknown>)
        : {};
    const data = pointerSet(base, env.updateDataModel.path, env.updateDataModel.value);
    return { ...state, data };
  }

  if ("updateComponents" in env) {
    const components = { ...state.components };
    for (const raw of env.updateComponents.components) {
      const node = normalizeNode(raw as unknown as Record<string, unknown>);
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
