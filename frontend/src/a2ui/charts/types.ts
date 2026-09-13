/**
 * Contratos de la capa de gráficas. Los adapters son funciones puras:
 * props del catálogo + data model -> opción de ECharts. Cero React, cero DOM.
 */

/** Opción de ECharts. Se usa un tipo laxo a propósito: los adapters arman
 *  objetos planos y ChartHost es el único que los entrega a `setOption`. */
export type EChartsOption = Record<string, unknown>;

export type FormatKind = "currency" | "percent" | "number";

/** Tonos usados por BarChart/LineChart/ProgressRing (catalog.py). */
export type ChartTone = "neutral" | "ahorro" | "costo";

/** Paleta resuelta desde las CSS custom properties (design/tokens.css). */
export interface Theme {
  red: string; // --bn-red
  redDeep: string; // --bn-red-deep
  redWash: string; // --bn-red-wash
  gray: string; // --bn-gray
  graySoft: string; // --bn-gray-soft
  ahorro: string; // --bn-ahorro
  ahorroWash: string; // --bn-ahorro-wash
  line: string; // --bn-line
  ink: string; // --bn-ink
  mute: string; // --bn-mute
  surface: string; // --bn-surface
  sidebarBg: string; // --bn-sidebar-bg (tooltip bg)
  cardBorder: string; // --bn-card-border (tooltip border)
  inkFull: string; // --bn-ink-full (tooltip text)
}

export interface ChartCtx {
  t: Theme;
  reducedMotion: boolean;
  width: number;
  fmt: (n: number, f?: FormatKind) => string;
}

export interface ChartAdapter<P = Record<string, unknown>> {
  /** Debe coincidir exactamente con la clave del catálogo (catalog.py). */
  name: string;
  toOption(props: P, data: unknown, ctx: ChartCtx): EChartsOption;
  isEmpty?(props: P, data: unknown): boolean;
  height?: number | ((props: P) => number);
}
