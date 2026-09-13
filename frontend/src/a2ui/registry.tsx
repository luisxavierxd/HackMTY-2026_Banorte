import React from "react";
import type { ComponentType, ReactNode } from "react";
import type { ActionRef, Surface } from "../contract/a2ui";
import type { RenderCtx } from "./types";

import Column from "./components/Column";
import Row from "./components/Row";
import Card from "./components/Card";
import Divider from "./components/Divider";
import Text from "./components/Text";
import Badge from "./components/Badge";
import MetricCard from "./components/MetricCard";
import DataTable from "./components/DataTable";
import OptionList from "./components/OptionList";
import Slider from "./components/Slider";
import TextField from "./components/TextField";
import ActionButton from "./components/ActionButton";
import Timeline from "./components/Timeline";
import Callout from "./components/Callout";
import UnknownComponent from "./components/UnknownComponent";
import { CHART_ADAPTERS } from "./charts/registry";
import ChartHost from "./charts/ChartHost";

import "./components.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<{ id: string; props: any; ctx: RenderCtx }>;

const MAX_DEPTH = 12;

const CONTAINERS = new Set(["Column", "Row"]);

function componentLabel(component: string, props: Record<string, unknown>): string {
  const p = props || {};
  if (p.title) return String(p.title);
  if (p.label) return String(p.label);
  if (p.text && typeof p.text === "string") return p.text.length > 60 ? p.text.slice(0, 57) + "…" : p.text;
  const fallback: Record<string, string> = {
    LineChart: "Gráfica de líneas", BarChart: "Gráfica de barras",
    PieChart: "Gráfica circular", ComparisonBars: "Comparación",
    ProgressRing: "Indicador de progreso", Timeline: "Línea de tiempo",
    DataTable: "Tabla de datos", Divider: "", Badge: "",
  };
  return fallback[component] ?? "";
}

/** Nombre del componente A2UI (catalog.py) -> renderer de React. */
const REGISTRY: Record<string, AnyComponent> = {
  Column,
  Row,
  Card,
  Divider,
  Text,
  Badge,
  MetricCard,
  DataTable,
  OptionList,
  Slider,
  TextField,
  ActionButton,
  Timeline,
  Callout,
  // Gráficas (BarChart, LineChart, ProgressRing, PieChart, ComparisonBars)
  // se enrutan a ChartHost, ver CHART_ADAPTERS más abajo en renderComponent.
};

export interface SurfaceActions {
  setLocal: (path: string, value: unknown) => void;
  runAction: (action: ActionRef | undefined, label?: string) => void;
  busy?: boolean;
}

/** Punto de entrada: pinta el árbol completo desde la raíz de la superficie. */
export function renderSurface(surface: Surface | null, data: unknown, actions: SurfaceActions): ReactNode {
  if (!surface || !surface.root) return null;
  return renderComponent(surface.root, surface, data, 0, actions);
}

function renderComponent(
  id: string,
  surface: Surface,
  data: unknown,
  depth: number,
  actions: SurfaceActions
): ReactNode {
  if (depth > MAX_DEPTH) {
    console.warn("[a2ui] profundidad máxima de árbol alcanzada, se corta el render");
    return null;
  }

  const node = surface.components[id];
  if (!node) return null; // referencia rota: se omite, no truena el render

  const ctx: RenderCtx = {
    data,
    busy: actions.busy,
    setLocal: actions.setLocal,
    runAction: actions.runAction,
    renderChild: (childId) => (childId ? renderComponent(childId, surface, data, depth + 1, actions) : null),
    renderChildren: (ids) =>
      (ids ?? []).map((cid) => (
        <React.Fragment key={cid}>{renderComponent(cid, surface, data, depth + 1, actions)}</React.Fragment>
      )),
  };

  const label = CONTAINERS.has(node.component) ? "" : componentLabel(node.component, node.props);

  if (CHART_ADAPTERS[node.component]) {
    return (
      <div key={id} data-bn-component={node.component} data-bn-label={label || undefined}>
        <ChartHost node={node} data={data} ctx={ctx} />
      </div>
    );
  }

  const Comp = REGISTRY[node.component];
  if (!Comp) {
    console.warn(`[a2ui] componente desconocido: "${node.component}"`);
    return <UnknownComponent key={id} name={node.component} />;
  }

  if (CONTAINERS.has(node.component) || !label) {
    return <Comp key={id} id={id} props={node.props} ctx={ctx} />;
  }

  return (
    <div key={id} data-bn-component={node.component} data-bn-label={label}>
      <Comp id={id} props={node.props} ctx={ctx} />
    </div>
  );
}
