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

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from ..a2ui.composer import CompileResult, compile_plan, fallback_plan
from ..config import Settings
from ..mcpx.manager import McpManager
from ..providers import Completion, LLMProvider, ToolCall, ToolSpec, build_provider, text_msg
from ..providers.cli_agent import CliAgentProvider
from .prompts import reasoning_system_prompt, tool_manifest_prompt, ui_system_prompt

log = logging.getLogger("harness.agent")


async def _complete_stream(provider: LLMProvider, **kwargs: Any) -> AsyncIterator[dict | Completion]:
    """Como `provider.complete(**kwargs)`, pero si el proveedor puede reportar
    progreso en vivo (hoy: solo `claude_code` en modo streaming) va cediendo
    eventos `{"type":"thinking",...}` mientras el CLI sigue trabajando, en vez
    de bloquear a ciegas hasta que termine (turnos de 10-180s con el CLI).

    Para cualquier otro proveedor (fake, anthropic, gemini, antigravity) esto
    es un `await` normal, sin cambio de comportamiento: la condición de abajo
    solo es True para `claude_code` con streaming activo.

    El último item cedido siempre es el `Completion` final.
    """
    if not (isinstance(provider, CliAgentProvider) and provider.cfg.get("streaming")):
        yield await provider.complete(**kwargs)
        return

    queue: asyncio.Queue[dict] = asyncio.Queue()

    async def on_event(ev: dict) -> None:
        await queue.put(ev)

    task = asyncio.ensure_future(provider.complete(**kwargs, on_event=on_event))
    while not task.done():
        try:
            yield await asyncio.wait_for(queue.get(), timeout=0.5)
        except asyncio.TimeoutError:
            continue
    while not queue.empty():
        yield queue.get_nowait()
    yield await task  # re-lanza si complete() falló; si no, el Completion


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
            completion: Completion | None = None
            async for item in _complete_stream(
                self.reasoner,
                system=system,
                messages=history,
                tools=specs if native else None,
                json_mode=not native,
                temperature=self.s.temperature,
            ):
                if isinstance(item, Completion):
                    completion = item
                else:
                    yield item
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
        result: CompileResult | None = None
        plan: dict | None = None
        async for item in self._compose_ui(user_text, final_text, trace, first_render):
            if isinstance(item, tuple):
                result, plan = item
            else:
                yield item
        log.info("run_turn: cediendo evento surface (título=%r)", plan.get("title", ""))
        yield {
            "type": "surface",
            "title": plan.get("title", ""),
            "summary": plan.get("summary", final_text),
            "a2ui": result.messages,
            "warnings": result.errors,
        }
        log.info("run_turn: surface cedido, cerrando turno")
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
    ) -> AsyncIterator[dict | tuple[CompileResult, dict]]:
        """Async generator: cede eventos de progreso (dict) mientras compone,
        y al final cede exactamente un `(CompileResult, plan)` — así `run_turn`
        puede reenviar el progreso del CLI sin que este método deje de
        devolver, en esencia, lo mismo que antes."""
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
                completion: Completion | None = None
                async for item in _complete_stream(
                    self.composer,
                    system=system,
                    messages=messages,
                    json_mode=True,
                    temperature=self.s.ui_temperature,
                ):
                    if isinstance(item, Completion):
                        completion = item
                    else:
                        yield item
                plan = extract_json(completion.text)
                # /datos/<tool> siempre son los resultados REALES de las tools
                # (auto-inyectados) — si el modelo redeclara su propia "datos"
                # (visto en producción, con las claves completas en vez de
                # cortas), la real debe ganar sin importar el orden en que
                # el modelo la haya escrito.
                plan_data = plan.get("data") or {}
                plan_data["datos"] = auto
                plan["data"] = plan_data
                result = compile_plan(plan, self.s.surface_id, first_render)
                log.info(
                    "compose_ui intento %s: ok=%s componentes=%s errores=%s",
                    attempt + 1, result.ok, len(result.components), result.errors[:3],
                )
                if result.ok:
                    yield (result, plan)
                    return
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
        yield (compile_plan(plan, self.s.surface_id, first_render), plan)
