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
  busy?: boolean;
  setLocal: (path: string, value: unknown) => void;
  /** `label` es el texto visible del control que disparó la acción (ej. el
   *  texto del ActionButton) — sirve para mostrarlo en el historial de la
   *  conversación sin adivinar a partir del nombre técnico del evento. */
  runAction: (action: ActionRef | undefined, label?: string) => void;
  renderChild: (id: string | undefined) => ReactNode;
  renderChildren: (ids: string[] | undefined) => ReactNode;
  /** Devuelve el tipo de componente A2UI ("Callout", "ActionButton", …) de un ID hijo. */
  getComponentType: (id: string) => string | undefined;
  /** ¿El subárbol de este hijo contiene una gráfica? Las gráficas suelen venir
   *  dentro de una Card, así que el tipo del hijo directo no alcanza. */
  hasChartDescendant: (id: string) => boolean;
}

export interface A2UIComponentProps<P = Record<string, unknown>> {
  id: string;
  props: P;
  ctx: RenderCtx;
}
