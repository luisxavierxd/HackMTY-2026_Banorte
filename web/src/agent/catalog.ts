/**
 * El catálogo A2UI, leído del artefacto generado en build.
 *
 * En los modos `recorded` y `browser` el catálogo NO se le pide a ningún
 * backend: se lee de `public/contract/catalog.json`, que `scripts/export_contract.py`
 * emite byte a byte igual a lo que servía `GET /a2ui/catalog.json`. Esa es la
 * única cosa del Python que cruza a este target (§3 de la spec).
 *
 * Puerto de la parte de lectura de `a2ui/catalog.py`.
 */

export interface PropSpec {
  type: string;
  values?: string[];
  default?: unknown;
  required?: boolean;
  keys?: string[];
}

export interface ComponentSpec {
  doc: string;
  props: Record<string, PropSpec>;
}

export interface CatalogDocument {
  catalogId: string;
  name: string;
  version: string;
  components: Record<string, ComponentSpec>;
}

let cached: CatalogDocument | null = null;
let inflight: Promise<CatalogDocument> | null = null;

/**
 * Ruta relativa a `BASE_URL`, nunca absoluta: con custom domain el sitio vive
 * en la raíz, pero al vencer `banky.mx` se sirve desde el subpath de Pages y
 * una ruta `/contract/...` dejaría de resolver (§7 de la spec).
 */
export function contractUrl(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}contract/${file}`;
}

function catalogUrl(): string {
  return contractUrl("catalog.json");
}

export async function loadCatalog(): Promise<CatalogDocument> {
  if (cached) return cached;
  if (!inflight) {
    inflight = fetch(catalogUrl())
      .then(async (resp) => {
        if (!resp.ok) {
          throw new Error(`no se pudo leer el catálogo (HTTP ${resp.status})`);
        }
        const doc = (await resp.json()) as CatalogDocument;
        if (!doc?.components || typeof doc.components !== "object") {
          throw new Error("el catálogo no trae 'components'");
        }
        cached = doc;
        return doc;
      })
      .catch((err) => {
        // Sin esto un fallo de red deja la promesa envenenada para siempre y
        // ningún turno posterior puede recuperarse.
        inflight = null;
        throw err;
      });
  }
  return inflight;
}

/** Versión compacta para el prompt del compositor. Puerto de `catalog_prompt_digest`. */
export function catalogPromptDigest(catalog: CatalogDocument): string {
  const lines: string[] = [];
  for (const [name, spec] of Object.entries(catalog.components)) {
    const props: string[] = [];
    for (const [pname, p] of Object.entries(spec.props)) {
      const t = p.type === "enum" ? (p.values ?? []).join("|") : p.type;
      props.push(`${pname}:${t}${p.required ? "*" : ""}`);
    }
    lines.push(`- ${name}(${props.join(", ")}) — ${spec.doc}`);
  }
  return lines.join("\n");
}
