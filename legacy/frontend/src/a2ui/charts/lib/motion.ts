import type { ChartCtx } from "../types";

/**
 * Config de animación compartida por todos los adapters. Respeta
 * prefers-reduced-motion (ChartHost calcula ctx.reducedMotion).
 */
export function animationConfig(ctx: ChartCtx) {
  if (ctx.reducedMotion) {
    return { animation: false as const, animationDuration: 0 };
  }
  return {
    animation: true as const,
    animationDuration: 900,
    animationEasing: "cubicOut" as const,
    animationDelay: (idx: number) => idx * 60,
  };
}
