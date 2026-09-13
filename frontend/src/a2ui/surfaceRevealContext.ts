import { createContext } from "react";

/** How many Column children are currently visible (99 = all). */
export const SurfaceRevealContext = createContext<number>(99);

/** True inside a nested Column — nested columns skip reveal gating. */
export const IsNestedColumnContext = createContext<boolean>(false);
