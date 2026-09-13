"""Proveedor Anthropic — Messages API.

Diferencias con Gemini que este archivo absorbe:
  - acepta **JSON Schema completo** en `input_schema`: no hay que sanitizar,
    los esquemas de MCP pasan tal cual (MCP y Anthropic comparten linaje);
  - los resultados de herramienta son bloques `tool_result` referenciados por
    `tool_use_id`, dentro de un mensaje de rol "user";
  - no existe `response_mime_type`: para JSON estricto se **prellena** la
    respuesta del asistente con "{" y se reconstruye al recibirla.
"""

from __future__ import annotations

import json
from typing import Any

from .base import Completion, Message, ToolCall, ToolSpec


class AnthropicProvider:
    name = "anthropic"
    native_tools = True

    def __init__(self, api_key: str, model: str, max_tokens: int = 4096):
        import anthropic

        self.model = model
        self.max_tokens = max_tokens
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    # ---------------- traducción neutral -> nativo ---------------- #
    @staticmethod
    def _to_messages(messages: list[Message]) -> list[dict]:
        out: list[dict] = []
        for msg in messages:
            content: list[dict] = []
            for block in msg.get("content", []):
                kind = block.get("type")
                if kind == "text" and block.get("text"):
                    content.append({"type": "text", "text": block["text"]})
                elif kind == "tool_call":
                    content.append(
                        {
                            "type": "tool_use",
                            "id": block["id"],
                            "name": block["name"],
                            "input": block.get("args", {}),
                        }
                    )
                elif kind == "tool_result":
                    content.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block["id"],
                            "content": json.dumps(block.get("result", {}), ensure_ascii=False),
                        }
                    )
            if not content:
                continue
            # los tool_result deben ir en un mensaje de rol "user"
            role = "user" if any(b["type"] == "tool_result" for b in content) else msg["role"]
            out.append({"role": role, "content": content})
        return out

    @staticmethod
    def _to_tools(tools: list[ToolSpec]) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description[:1024],
                "input_schema": t.schema or {"type": "object", "properties": {}},
            }
            for t in tools
        ]

    # ---------------------------- API ----------------------------- #
    async def complete(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        json_mode: bool = False,
        temperature: float = 0.2,
    ) -> Completion:
        native = self._to_messages(messages)

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": system,
            "messages": native,
            "temperature": temperature,
        }
        if tools:
            kwargs["tools"] = self._to_tools(tools)

        resp = await self._client.messages.create(**kwargs)

        text_parts, calls = [], []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                calls.append(ToolCall(id=block.id, name=block.name, args=dict(block.input or {})))

        text = "".join(text_parts)

        return Completion(
            text=text,
            tool_calls=calls,
            usage={
                "input_tokens": resp.usage.input_tokens,
                "output_tokens": resp.usage.output_tokens,
            },
            provider=self.name,
            model=self.model,
        )
