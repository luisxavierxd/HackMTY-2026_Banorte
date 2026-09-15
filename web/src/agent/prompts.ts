/**
 * Los prompts del agente, leídos del contrato generado.
 *
 * Las plantillas NO se copian a mano desde `agent/prompts.py`: viajan como
 * artefacto en `web/public/contract/prompts.json`, que emite
 * `scripts/export_contract.py` leyendo el Python.
 *
 * Por qué generarlas en vez de duplicarlas: un prompt desincronizado no rompe
 * el build ni falla un test — degrada las respuestas en silencio, y el
 * navegador y el harness empiezan a producir pantallas distintas para la
 * misma pregunta sin que nadie se entere. Los goldens cubren las tools; esto
 * cubre lo que las rodea.
 */
import type { ToolSpec } from "../provider/types";
import { contractUrl } from "./catalog";

/** Espejo de las claves que escribe `export_contract.py`. */
export interface PromptTemplates {
  reasoningSystem: string;
  toolManifest: string;
  uiSystem: string;
  profileContext: string;
  /** Catálogo compacto para el prompt, ya digerido por el Python. */
  catalogDigest: string;
}

export type Profile = Record<string, unknown> | null | undefined;

let cached: PromptTemplates | null = null;
let inFlight: Promise<PromptTemplates> | null = null;

function isComplete(raw: unknown): raw is PromptTemplates {
  if (typeof raw !== "object" || raw === null) return false;
  const p = raw as Record<string, unknown>;
  return (
    typeof p.reasoningSystem === "string" &&
    typeof p.toolManifest === "string" &&
    typeof p.uiSystem === "string" &&
    typeof p.profileContext === "string" &&
    typeof p.catalogDigest === "string"
  );
}

/** Carga y cachea las plantillas. Se comparte la promesa: N turnos en paralelo
 *  al arrancar no disparan N fetches del mismo archivo. */
export function loadPrompts(signal?: AbortSignal): Promise<PromptTemplates> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch(contractUrl("prompts.json"), { signal });
    if (!res.ok) {
      throw new Error(
        `no se pudo leer prompts.json (HTTP ${res.status}) — corre \`make contract\``,
      );
    }
    const raw: unknown = await res.json();
    if (!isComplete(raw)) {
      throw new Error("prompts.json está incompleto — corre `make contract`");
    }
    cached = raw;
    return raw;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

/** `String.replace` con un literal sustituye solo la primera ocurrencia y trata
 *  `$&` y compañía como referencias; `split`/`join` no hace ninguna de las dos. */
function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

export function reasoningSystemPrompt(
  prompts: PromptTemplates,
  domain: string,
  profile?: Profile,
): string {
  let system = fill(prompts.reasoningSystem, { domain });
  if (profile && str(profile.nombre)) {
    system += fill(prompts.profileContext, {
      nombre: str(profile.nombre),
      ingreso_mensual: str(profile.ingresoMensual),
      gastos_mensuales: str(profile.gastosMensuales),
      ahorro: str(profile.ahorro),
      inversion: str(profile.inversion),
    });
  }
  return system;
}

/** Manifiesto para proveedores sin function calling nativo. */
export function toolManifestPrompt(prompts: PromptTemplates, tools: ToolSpec[]): string {
  const lines = tools.map((t) => {
    const firstLine = (t.description || "").trim().split("\n")[0] ?? "";
    const props = (t.schema?.properties as unknown) ?? {};
    return `- ${t.name}: ${firstLine}\n  args: ${JSON.stringify(props)}`;
  });
  return fill(prompts.toolManifest, { tools: lines.join("\n") || "(ninguna)" });
}

export function uiSystemPrompt(prompts: PromptTemplates, maxComponents = 24): string {
  return fill(prompts.uiSystem, {
    catalog: prompts.catalogDigest,
    max_components: String(maxComponents),
  });
}

/** Puerto de `action_to_prompt` de app.py: cierra el ciclo hacia el agente. */
export function actionToPrompt(
  name: string,
  params: Record<string, unknown>,
  dataModel: Record<string, unknown>,
): string {
  return (
    `[EVENTO_UI] La persona interactuó con la interfaz generada.\n` +
    `accion: ${name}\n` +
    `params: ${JSON.stringify(params)}\n` +
    `estado_actual_de_la_pantalla: ${JSON.stringify(dataModel)}\n` +
    `Ejecuta lo que corresponda con las herramientas y devuelve la nueva pantalla.`
  );
}
