/**
 * Factory de proveedores. En el target navegador el proveedor SÍ es elección
 * del usuario final (invierte el ADR 0005, que sigue vigente para el target
 * hospedado): sin backend propio no hay despliegue que fije el flag, y la
 * credencial es del usuario, así que la elección también.
 */
import { AnthropicAdapter, ANTHROPIC_MODEL } from "./anthropic";
import { GeminiAdapter, GEMINI_MODEL } from "./gemini";
import type { ProviderAdapter, ProviderId } from "./types";

export * from "./types";
export { AnthropicAdapter, ANTHROPIC_MODEL } from "./anthropic";
export { GeminiAdapter, GEMINI_MODEL } from "./gemini";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  model: string;
  /** De dónde saca la persona su key — se muestra en el gate. */
  keyUrl: string;
  note: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    model: ANTHROPIC_MODEL,
    keyUrl: "https://console.anthropic.com/settings/keys",
    note: "Tu key se queda en esta pestaña.",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    model: GEMINI_MODEL,
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Google AI Studio tiene tier gratuito.",
  },
};

export function buildProvider(id: ProviderId, apiKey: string): ProviderAdapter {
  switch (id) {
    case "anthropic":
      return new AnthropicAdapter(apiKey);
    case "gemini":
      return new GeminiAdapter(apiKey);
  }
}
