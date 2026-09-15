"""Tipos neutrales de proveedor.

El resto del harness (ciclo del agente, MCP, composer A2UI) habla ESTOS tipos.
Cada proveedor traduce a su API nativa y de regreso. Cambiar de Gemini a
Anthropic —o a un CLI agéntico— es una línea de configuración, no un refactor:
el ciclo, el catálogo y el composer no se enteran.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class ToolSpec:
    """Herramienta MCP en JSON Schema crudo. Cada proveedor la adapta."""

    name: str
    description: str
    schema: dict[str, Any]


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass
class Completion:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict[str, Any] = field(default_factory=dict)
    provider: str = ""
    model: str = ""


# Mensaje neutral:
#   {"role": "user" | "assistant", "content": [bloque, ...]}
# Bloques:
#   {"type": "text",        "text": "..."}
#   {"type": "tool_call",   "id": "...", "name": "...", "args": {...}}
#   {"type": "tool_result", "id": "...", "name": "...", "result": {...}}
Message = dict[str, Any]


def text_msg(role: str, text: str) -> Message:
    return {"role": role, "content": [{"type": "text", "text": text}]}


def blocks_of(msg: Message, kind: str) -> list[dict]:
    return [b for b in msg.get("content", []) if b.get("type") == kind]


@runtime_checkable
class LLMProvider(Protocol):
    """Contrato mínimo. Una sola operación: completar."""

    name: str
    model: str
    native_tools: bool  # False -> el ciclo usa tool calling por prompt

    async def complete(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        json_mode: bool = False,
        temperature: float = 0.2,
    ) -> Completion: ...
