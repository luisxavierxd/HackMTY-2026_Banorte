"""Registro de proveedores.

**El proveedor y el modelo son configuración de despliegue, no una opción del
usuario final.** No hay endpoint, header ni campo del WebSocket que los cambie:
se fijan en `config.py` (con override por variable de entorno para CI y Docker)
y el resto del sistema ya no decide nada al respecto.

Proveedores disponibles:
  gemini       Google AI Studio (Gemini Developer API)  — función calling nativo
  anthropic    Anthropic Messages API                   — function calling nativo
  claude_code  CLI `claude` headless                    — tool calling por prompt
  antigravity  CLI `agy` headless                       — tool calling por prompt
  fake         sin modelo; ejercita MCP + validación + A2UI
"""

from __future__ import annotations

import json
import logging

from .base import Completion, LLMProvider, Message, ToolCall, ToolSpec, text_msg

log = logging.getLogger("harness.provider")


class FakeProvider:
    """Sin red y sin costo. Llama la primera herramienta y devuelve un plan fijo.

    No es un juguete: recorre el ciclo completo (MCP real, validación real,
    envelopes A2UI reales). Es el plan B de la demo y la base de los tests.
    """

    name = "fake"
    model = "fake"
    native_tools = True

    async def complete(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        json_mode: bool = False,
        temperature: float = 0.2,
    ) -> Completion:
        already_called = any(
            b.get("type") == "tool_result" for m in messages for b in m.get("content", [])
        )
        if tools and not already_called:
            first = tools[0]
            return Completion(
                tool_calls=[ToolCall(id="fake-1", name=first.name, args={})],
                provider=self.name,
                model=self.model,
            )
        if json_mode:
            return Completion(
                text=json.dumps(
                    {
                        "title": "Modo demo sin modelo",
                        "summary": "Pipeline completo: MCP, validación y A2UI reales.",
                        "root": "root",
                        "data": {},
                        "components": [
                            {"id": "root", "component": "Column", "props": {"children": ["t", "cta"]}},
                            {"id": "t", "component": "Text", "props": {"text": "Modo demo sin modelo", "variant": "h2"}},
                            {
                                "id": "cta",
                                "component": "ActionButton",
                                "props": {"text": "Reintentar", "action": {"event": {"name": "reintentar", "params": {}}}},
                            },
                        ],
                    },
                    ensure_ascii=False,
                ),
                provider=self.name,
                model=self.model,
            )
        return Completion(text="Listo.", provider=self.name, model=self.model)


def build_provider(settings, role: str = "reasoning") -> LLMProvider:
    """Instancia el proveedor fijado en configuración.

    `role` permite usar uno distinto para razonar y para componer la UI
    (p. ej. un modelo grande razonando y uno rápido componiendo). Sigue siendo
    configuración de código: el usuario no elige nada.
    """
    kind = settings.provider_for(role)
    model = settings.model_for(role)

    if kind == "fake":
        return FakeProvider()

    if kind == "gemini":
        from .gemini import GeminiProvider

        return GeminiProvider(settings.google_api_key, model)

    if kind == "anthropic":
        from .anthropic_api import AnthropicProvider

        return AnthropicProvider(settings.anthropic_api_key, model, settings.max_output_tokens)

    if kind in ("claude_code", "antigravity"):
        from .cli_agent import CliAgentProvider

        provider = CliAgentProvider(
            preset=kind,
            model=model,
            binary=settings.cli_binary or None,
            timeout_s=settings.cli_timeout_s,
            mcp_config=settings.cli_mcp_config or None,
            delegate_mcp=settings.cli_delegate_mcp,
            extra_args=settings.cli_extra_args,
        )
        provider.check()
        return provider

    raise SystemExit(f"LLM_PROVIDER desconocido: '{kind}'")


__all__ = [
    "Completion",
    "FakeProvider",
    "LLMProvider",
    "Message",
    "ToolCall",
    "ToolSpec",
    "build_provider",
    "text_msg",
]
