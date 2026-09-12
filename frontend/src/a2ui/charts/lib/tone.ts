import type { ChartTone, Theme } from "../types";

/** tone -> color sólido. Nunca hardcodear hex en los adapters: siempre pasar por aquí. */
export function toneColor(tone: ChartTone | undefined, t: Theme): string {
  switch (tone) {
    case "costo":
      return t.red;
    case "ahorro":
      return t.ahorro;
    case "neutral":
    default:
      return t.gray;
  }
}

/** tone -> color "wash" (usado en areaStyle / fondos suaves). */
export function toneWash(tone: ChartTone | undefined, t: Theme): string {
  switch (tone) {
    case "costo":
      return t.redWash;
    case "ahorro":
      return t.ahorroWash;
    case "neutral":
    default:
      return t.line;
  }
}
