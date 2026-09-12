/**
 * Tipos que reflejan el catálogo A2UI del backend (src/harness/a2ui/catalog.py).
 * No es un espejo exhaustivo: solo lo que el frontend necesita para renderizar
 * y para cerrar el ciclo de acciones hacia el agente.
 */

/** Una prop puede ser un literal, o un binding a un JSON Pointer del data model. */
export type Binding<T = unknown> = T | { path: string };

export function isBindingRef(value: unknown): value is { path: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).path === "string"
  );
}

/** Referencia de acción tal como la emite el composer: {event:{name, params}}. */
export interface ActionRef {
  event: {
    name: string;
    params?: Record<string, unknown>;
  };
}

export function isActionRef(value: unknown): value is ActionRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { event?: unknown }).event === "object" &&
    (value as { event?: unknown }).event !== null &&
    typeof ((value as { event: { name?: unknown } }).event.name) === "string"
  );
}

/** Nodo plano del árbol de componentes. Los hijos son ids, no objetos anidados. */
export interface ComponentNode {
  id: string;
  component: string;
  props: Record<string, unknown>;
}

/** Estado de una superficie A2UI reconstruido en el cliente. */
export interface Surface {
  id: string;
  root?: string;
  components: Record<string, ComponentNode>;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Envelopes (server -> client), ver documentacion/INTEGRACION_FRONTEND.md
// ---------------------------------------------------------------------------
export interface CreateSurfaceEnvelope {
  createSurface: {
    surfaceId: string;
    catalogId?: string;
    sendDataModel?: boolean;
    theme?: unknown;
  };
}

export interface UpdateDataModelEnvelope {
  updateDataModel: {
    surfaceId: string;
    path: string;
    value: unknown;
  };
}

export interface UpdateComponentsEnvelope {
  updateComponents: {
    surfaceId: string;
    components: ComponentNode[];
  };
}

export interface DeleteSurfaceEnvelope {
  deleteSurface: {
    surfaceId: string;
  };
}

export type Envelope =
  | CreateSurfaceEnvelope
  | UpdateDataModelEnvelope
  | UpdateComponentsEnvelope
  | DeleteSurfaceEnvelope;

export type Tone = "neutral" | "success" | "warning" | "danger";
export type FormatKind = "currency" | "percent" | "number";
