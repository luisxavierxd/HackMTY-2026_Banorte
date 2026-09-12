import type { ReactNode } from "react";
import type { ActionRef } from "../contract/a2ui";

/**
 * Contexto que cada componente A2UI recibe para poder renderizar hijos,
 * resolver el data model y cerrar el ciclo de interacción con el agente.
 *
 * - `setLocal` es optimista: cambia el valor visible al instante (mientras
 *   se escribe/arrastra/selecciona) sin tocar la red.
 * - `runAction` es lo que manda el mensaje `{type:"action"}` al servidor,
 *   incluyendo cualquier cambio local pendiente como `dataModel`.
 */
export interface RenderCtx {
  data: unknown;
  setLocal: (path: string, value: unknown) => void;
  runAction: (action: ActionRef | undefined) => void;
  renderChild: (id: string | undefined) => ReactNode;
  renderChildren: (ids: string[] | undefined) => ReactNode;
}

export interface A2UIComponentProps<P = Record<string, unknown>> {
  id: string;
  props: P;
  ctx: RenderCtx;
}
