import { createContext } from "react";

/** How many Column children are currently visible (99 = all). */
export const SurfaceRevealContext = createContext<number>(99);

/** True inside a nested Column — nested columns skip reveal gating. */
export const IsNestedColumnContext = createContext<boolean>(false);

/** Controls which root-level card is expanded to full-screen (null = none). */
export interface CardExpandCtx {
  expanded: number | null;
  setExpanded: (i: number | null) => void;
}
export const CardExpandContext = createContext<CardExpandCtx>({
  expanded: null,
  setExpanded: () => {},
});
