import type { FormatKind } from "../types";

/**
 * Formato numérico es-MX compartido por todos los adapters. Espejo de
 * DataTable.formatCell para que gráficas y tablas nunca se vean distintas.
 */
export function formatNumber(n: number, kind: FormatKind = "number"): string {
  if (!Number.isFinite(n)) return "—";
  if (kind === "currency") {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(n);
  }
  if (kind === "percent") {
    return new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 }).format(n);
  }
  return new Intl.NumberFormat("es-MX").format(n);
}
