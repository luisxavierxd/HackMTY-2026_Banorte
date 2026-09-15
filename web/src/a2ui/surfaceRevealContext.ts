import { createContext } from "react";

/** How many Column children are currently visible (99 = all). */
export const SurfaceRevealContext = createContext<number>(99);

/** True inside a nested Column — nested columns skip reveal gating. */
export const IsNestedColumnContext = createContext<boolean>(false);

/**
 * Factor vertical para las gráficas (1 = altura natural del adapter).
 *
 * El bento tiene una altura fija y eso no se negocia: el dashboard mide lo que
 * mide. Con gráficas en UNA sola fila queda perfecto, pero cuando el agente
 * reparte gráficas en las DOS filas la suma se pasa y la celda —que recorta—
 * se come lo de abajo. En vez de dejar crecer el bento, se aplastan un poco
 * las gráficas para que las dos filas quepan en el mismo alto de siempre.
 *
 * Lo calcula la Column raíz, que es la única que sabe cómo quedó el reparto.
 */
export const ChartScaleContext = createContext<number>(1);

/** Controls which root-level card is expanded to full-screen (null = none). */
export interface CardExpandCtx {
  expanded: number | null;
  setExpanded: (i: number | null) => void;
}
export const CardExpandContext = createContext<CardExpandCtx>({
  expanded: null,
  setExpanded: () => {},
});
