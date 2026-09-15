/**
 * Puerto de `a2ui/composer.py` + `a2ui/messages.py`.
 *
 * El modelo NO emite protocolo crudo: emite un plan compacto que aquí se
 * valida contra el catálogo y se traduce a envelopes A2UI v0.9.1. Esa
 * validación es la razón por la que una alucinación de componente no rompe
 * el render — se poda, se reporta y, si el plan queda inservible, se repara
 * o cae al fallback.
 */
import type { CatalogDocument, PropSpec } from "./catalog";

const A2UI_VERSION = "v0.9.1";

export interface PlanComponent {
  id?: unknown;
  component?: unknown;
  props?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UiPlan {
  title?: string;
  summary?: string;
  root?: string;
  data?: Record<string, unknown>;
  components?: PlanComponent[];
}

export interface CompileResult {
  ok: boolean;
  messages: Record<string, unknown>[];
  components: Record<string, unknown>[];
  data: Record<string, unknown>;
  errors: string[];
  dropped: string[];
}

// ── envelopes ────────────────────────────────────────────────────────────

function createSurface(surfaceId: string, catalogId: string): Record<string, unknown> {
  return {
    version: A2UI_VERSION,
    createSurface: { surfaceId, catalogId, sendDataModel: true },
  };
}

function updateComponents(
  surfaceId: string,
  components: Record<string, unknown>[]
): Record<string, unknown> {
  return { version: A2UI_VERSION, updateComponents: { surfaceId, components } };
}

function updateDataModel(
  surfaceId: string,
  path: string,
  value: unknown
): Record<string, unknown> {
  return { version: A2UI_VERSION, updateDataModel: { surfaceId, path, value } };
}

// ── validación ───────────────────────────────────────────────────────────

function isBinding(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length === 1 && keys[0] === "path";
}

function coerceProp(
  comp: string,
  cid: string,
  pname: string,
  spec: PropSpec,
  value: unknown,
  errors: string[]
): unknown {
  switch (spec.type) {
    case "binding":
      // literal (string/number/bool) o {"path": "/ptr"} — las dos son válidas
      return isBinding(value) ? value : value;
    case "enum": {
      const values = spec.values ?? [];
      if (values.includes(value as string)) return value;
      errors.push(`${cid}(${comp}).${pname}='${String(value)}' no está en ${JSON.stringify(values)}`);
      return "default" in spec ? spec.default : values[0];
    }
    case "number": {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
      errors.push(`${cid}(${comp}).${pname} debe ser número`);
      return "default" in spec ? spec.default : 0;
    }
    case "string":
      return typeof value === "string" ? value : String(value);
    case "boolean":
      return Boolean(value);
    default:
      // componentId | componentIds | objectList | action pasan tal cual
      return value;
  }
}

export function validateComponents(
  raw: PlanComponent[] | undefined,
  catalog: CatalogDocument
): { components: Record<string, unknown>[]; errors: string[]; dropped: string[] } {
  const errors: string[] = [];
  const dropped: string[] = [];
  const byId = new Map<string, Record<string, unknown>>();

  for (const item of raw ?? []) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push("componente que no es objeto");
      continue;
    }
    const cid = item.id;
    const comp = item.component;
    const props: Record<string, unknown> =
      item.props && typeof item.props === "object"
        ? item.props
        : Object.fromEntries(
            Object.entries(item).filter(([k]) => k !== "id" && k !== "component")
          );

    if (!cid || !comp || typeof cid !== "string" || typeof comp !== "string") {
      errors.push(`componente sin id/component: ${JSON.stringify(item).slice(0, 80)}`);
      continue;
    }
    const compSpec = catalog.components[comp];
    if (!compSpec) {
      errors.push(`'${comp}' no existe en el catálogo (id=${cid})`);
      dropped.push(cid);
      continue;
    }

    const spec = compSpec.props;
    const clean: Record<string, unknown> = {};
    for (const [pname, pspec] of Object.entries(spec)) {
      if (pname in props && props[pname] !== null && props[pname] !== undefined) {
        clean[pname] = coerceProp(comp, cid, pname, pspec, props[pname], errors);
      } else if ("default" in pspec) {
        clean[pname] = pspec.default;
      } else if (pspec.required) {
        errors.push(`${cid}(${comp}) falta prop requerida '${pname}'`);
      }
    }
    for (const extra of Object.keys(props)) {
      if (!(extra in spec)) {
        errors.push(`${cid}(${comp}) prop desconocida '${extra}' (ignorada)`);
      }
    }
    byId.set(cid, { id: cid, component: comp, ...clean });
  }

  // Poda de referencias rotas: children/child que apuntan a ids inexistentes.
  for (const [cid, node] of [...byId.entries()]) {
    if (Array.isArray(node.children)) {
      const alive = (node.children as unknown[]).filter(
        (c) => typeof c === "string" && byId.has(c)
      );
      if (alive.length !== (node.children as unknown[]).length) {
        errors.push(`${cid}: referencias rotas podadas en children`);
      }
      node.children = alive;
    }
    if ("child" in node && !byId.has(node.child as string)) {
      errors.push(`${cid}: child '${String(node.child)}' no existe`);
      delete node.child;
      dropped.push(cid);
      byId.delete(cid);
    }
  }

  return { components: [...byId.values()], errors, dropped };
}

export function compilePlan(
  plan: UiPlan,
  surfaceId: string,
  firstRender: boolean,
  catalog: CatalogDocument
): CompileResult {
  const { components, errors, dropped } = validateComponents(plan.components, catalog);
  const ids = new Set(components.map((c) => c.id as string));
  const root = plan.root || (components.length ? (components[0].id as string) : undefined);

  if (!components.length || !root || !ids.has(root)) {
    errors.push("plan sin root renderizable");
    return { ok: false, messages: [], components: [], data: {}, errors, dropped };
  }

  // Solo un ActionButton puede cerrar el ciclo hacia el agente: sin él la
  // persona no tiene forma de confirmar nada (ver catalog.py — OptionList,
  // Slider y TextField ya no tienen prop "action"). Rechazarlo aquí es lo que
  // fuerza el intento de reparación y, si el modelo insiste, el fallback.
  if (!components.some((c) => c.component === "ActionButton")) {
    errors.push(
      "el plan no incluye ningún ActionButton — toda pantalla necesita " +
        "un botón de confirmación explícito, ningún otro control puede cerrar el ciclo"
    );
    return { ok: false, messages: [], components: [], data: {}, errors, dropped };
  }

  // A2UI v0.9: el root es el primer componente de la lista.
  components.sort((a, b) => (a.id === root ? 0 : 1) - (b.id === root ? 0 : 1));

  const messages: Record<string, unknown>[] = [];
  if (firstRender) messages.push(createSurface(surfaceId, catalog.catalogId));
  const data = plan.data && typeof plan.data === "object" ? plan.data : {};
  if (Object.keys(data).length) messages.push(updateDataModel(surfaceId, "/", data));
  messages.push(updateComponents(surfaceId, components));

  return { ok: true, messages, components, data, errors, dropped };
}

/** Superficie mínima garantizada: la demo nunca se queda en blanco. */
export function fallbackPlan(title: string, body: string, retryAction = "reintentar"): UiPlan {
  return {
    title,
    summary: body,
    root: "root",
    data: {},
    components: [
      { id: "root", component: "Column", props: { children: ["t", "b", "cta"], gap: "md" } },
      { id: "t", component: "Text", props: { text: title, variant: "h2" } },
      { id: "b", component: "Text", props: { text: body, variant: "body" } },
      {
        id: "cta",
        component: "ActionButton",
        props: {
          text: "Reintentar",
          variant: "secondary",
          action: { event: { name: retryAction, params: {} } },
        },
      },
    ],
  };
}
