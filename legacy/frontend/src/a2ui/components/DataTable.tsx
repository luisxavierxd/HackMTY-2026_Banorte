import type { A2UIComponentProps } from "../types";
import type { Binding, FormatKind } from "../../contract/a2ui";
import { resolveBinding } from "../resolve";

interface ColumnSpec {
  key: string;
  label: string;
  format?: FormatKind;
}

interface DataTableProps {
  columns?: ColumnSpec[];
  rows?: Binding<Record<string, unknown>[]>;
  maxRows?: number;
}

function formatCell(value: unknown, format?: FormatKind): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (format === "currency") {
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (format === "percent") {
      return new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 }).format(value);
    }
    return new Intl.NumberFormat("es-MX").format(value);
  }
  return String(value);
}

export default function DataTable({ props, ctx }: A2UIComponentProps<DataTableProps>) {
  const columns = props.columns ?? [];
  const raw = resolveBinding<Record<string, unknown>[]>(props.rows, ctx.data, []);
  const rows = Array.isArray(raw) ? raw.slice(0, props.maxRows ?? 12) : [];

  if (rows.length === 0) {
    return <p className="bn-empty-inline">Sin datos por ahora.</p>;
  }

  return (
    <div className="bn-table-wrap">
      <table className="bn-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={typeof row[c.key] === "number" ? "bn-amount" : undefined}>
                  {formatCell(row[c.key], c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
