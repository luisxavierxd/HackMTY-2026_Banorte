"""Ciclo del agente: intención -> herramientas MCP -> plan de UI -> A2UI.

El ciclo es **agnóstico de proveedor**. Habla los tipos neutrales de
`providers.base` y no sabe si detrás hay Gemini, Anthropic o un CLI agéntico.
Solo consulta una capacidad: `provider.native_tools`.

  native_tools = True   -> el proveedor devuelve tool_calls estructurados
  native_tools = False  -> el manifiesto de herramientas va en el system prompt
                           y el ciclo parsea {"tool_calls": [...]} del texto

En los dos casos **las herramientas las ejecuta el harness** contra sus
servidores MCP. El modelo decide; el harness ejecuta y audita. Esa frontera no
se mueve con el proveedor: es lo que hace comparables las tres versiones.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from ..a2ui.composer import CompileResult, compile_plan, fallback_plan
from ..config import Settings
from ..mcpx.manager import McpManager
from ..providers import LLMProvider, ToolCall, ToolSpec, build_provider, text_msg
from .prompts import reasoning_system_prompt, tool_manifest_prompt, ui_system_prompt

log = logging.getLogger("harness.agent")


class AgentError(RuntimeError):
    pass


def extract_json(text: str) -> dict:
    """Tolera ```json, preámbulos y texto suelto alrededor del objeto."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        text = text.split("\n", 1)[1] if "\n" in text else text
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise AgentError("la respuesta no contiene JSON")
    return json.loads(text[start : end + 1])


def parse_prompted_calls(text: str) -> tuple[list[ToolCall], str]:
    """Interpreta la respuesta de un proveedor sin function calling nativo."""
    try:
        payload = extract_json(text)
    except (AgentError, json.JSONDecodeError):
        return [], (text or "").strip()
    if isinstance(payload.get("tool_calls"), list):
        calls = [
            ToolCall(
                id=uuid.uuid4().hex[:8],
                name=item.get("name", ""),
                args=item.get("args") or item.get("arguments") or {},
            )
            for item in payload["tool_calls"]
            if item.get("name")
        ]
        if calls:
            return calls, ""
    return [], str(payload.get("final") or payload.get("text") or text).strip()


class Agent:
    """Sin estado propio: la historia vive en la sesión. Escala horizontalmente."""

    def __init__(self, settings: Settings, mcp: McpManager):
        self.s = settings
        self.mcp = mcp
        self.reasoner: LLMProvider = build_provider(settings, "reasoning")
        self.composer: LLMProvider = build_provider(settings, "ui")

    # ------------------------------------------------------------------ #
    def describe(self) -> dict[str, Any]:
        return {
            "reasoning": {"provider": self.reasoner.name, "model": self.reasoner.model,
                          "native_tools": self.reasoner.native_tools},
            "ui": {"provider": self.composer.name, "model": self.composer.model},
        }

    def _tool_specs(self) -> list[ToolSpec]:
        return [
            ToolSpec(name=t.qualified, description=t.description, schema=t.input_schema)
            for t in self.mcp.tools.values()
        ]

    # ------------------------------------------------------------------ #
    async def run_turn(
        self, history: list[dict], user_text: str, domain: str, first_render: bool
    ) -> AsyncIterator[dict]:
        t0 = time.perf_counter()
        history.append(text_msg("user", user_text))

        specs = self._tool_specs()
        native = self.reasoner.native_tools
        system = reasoning_system_prompt(domain)
        if not native:
            system += tool_manifest_prompt(specs)

        trace: list[dict] = []
        final_text = ""
        usage: dict[str, Any] = {}

        for step in range(self.s.max_tool_steps):
            completion = await self.reasoner.complete(
                system=system,
                messages=history,
                tools=specs if native else None,
                json_mode=not native,
                temperature=self.s.temperature,
            )
            usage = completion.usage or usage

            if native:
                calls, final_text = completion.tool_calls, completion.text
            else:
                calls, final_text = parse_prompted_calls(completion.text)

            if not calls:
                if final_text:
                    history.append(text_msg("assistant", final_text))
                break

            history.append(
                {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_call", "id": c.id, "name": c.name, "args": c.args}
                        for c in calls
                    ],
                }
            )
            results = []
            for call in calls:
                yield {"type": "tool_call", "name": call.name, "args": call.args, "step": step}
                result = await self.mcp.call(call.name, call.args)
                trace.append({"tool": call.name, "args": call.args, "result": result})
                yield {"type": "tool_result", "name": call.name, "ok": "error" not in result}
                results.append(
                    {"type": "tool_result", "id": call.id, "name": call.name, "result": result}
                )
            history.append({"role": "user", "content": results})
        else:
            log.warning("presupuesto de herramientas agotado (%s)", self.s.max_tool_steps)

        yield {"type": "thinking", "text": "Diseñando la interfaz…"}
        result, plan = await self._compose_ui(user_text, final_text, trace, first_render)
        yield {
            "type": "surface",
            "title": plan.get("title", ""),
            "summary": plan.get("summary", final_text),
            "a2ui": result.messages,
            "warnings": result.errors,
        }
        history.append(text_msg("assistant", f"[UI generada] {plan.get('title', '')}"))
        yield {
            "type": "turn_end",
            "latency_ms": round((time.perf_counter() - t0) * 1000),
            "tools_used": [t["tool"] for t in trace],
            "provider": self.reasoner.name,
            "model": self.reasoner.model,
            "usage": usage,
        }

    # ------------------------------------------------------------------ #
    async def _compose_ui(
        self, user_text: str, agent_text: str, trace: list[dict], first_render: bool
    ) -> tuple[CompileResult, dict]:
        # Auto-inject tool results into data model so the UI can reference by path
        auto: dict[str, Any] = {}
        for item in trace:
            short = item["tool"].split("__")[-1]
            if short in auto:
                short = f"{short}_{sum(k.startswith(short) for k in auto) + 1}"
            auto[short] = item["result"]

        brief = {
            "intencion_usuario": user_text,
            "lectura_del_agente": agent_text,
            "datos_disponibles": trace[-self.s.max_trace_items :],
        }
        messages = [text_msg("user", json.dumps(brief, ensure_ascii=False))]
        system = ui_system_prompt(self.s.max_components)

        for attempt in range(2):  # 1 intento + 1 reparación con los errores del validador
            try:
                completion = await self.composer.complete(
                    system=system,
                    messages=messages,
                    json_mode=True,
                    temperature=self.s.ui_temperature,
                )
                plan = extract_json(completion.text)
                plan["data"] = {"datos": auto, **(plan.get("data") or {})}
                result = compile_plan(plan, self.s.surface_id, first_render)
                if result.ok:
                    return result, plan
                messages.append(text_msg("assistant", completion.text))
                messages.append(
                    text_msg(
                        "user",
                        "El plan fue rechazado por el validador:\n"
                        + "\n".join(result.errors[:10])
                        + "\nCorrígelo y devuelve solo el JSON.",
                    )
                )
            except Exception as exc:
                log.warning("composición de UI falló (intento %s): %s", attempt + 1, exc)

        plan = fallback_plan(
            "No pude armar esa pantalla",
            agent_text or "Intenta reformular lo que necesitas.",
        )
        return compile_plan(plan, self.s.surface_id, first_render), plan
