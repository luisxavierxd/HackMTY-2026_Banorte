"""Proveedor Gemini — Google AI Studio (Gemini Developer API).

Particularidades que este archivo absorbe para que el ciclo no las vea:
  - roles: "assistant" se llama "model";
  - los resultados de herramienta viajan como `function_response` en un turno
    de rol "user";
  - el esquema de parámetros es un subconjunto de OpenAPI, no JSON Schema
    completo -> `mcpx.adapter.sanitize_schema`;
  - JSON estricto se pide con `response_mime_type`, que sí existe aquí
    (en Anthropic hay que prellenar la respuesta).
"""

from __future__ import annotations

import uuid
from typing import Any

from ..mcpx.adapter import sanitize_schema
from .base import Completion, Message, ToolCall, ToolSpec


class GeminiProvider:
    name = "gemini"
    native_tools = True

    def __init__(self, api_key: str, model: str):
        from google import genai

        self.model = model
        self._client = genai.Client(api_key=api_key)

    # ---------------- traducción neutral -> nativo ---------------- #
    @staticmethod
    def _to_contents(messages: list[Message]) -> list[dict]:
        contents: list[dict] = []
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            parts: list[dict] = []
            for block in msg.get("content", []):
                kind = block.get("type")
                if kind == "text" and block.get("text"):
                    parts.append({"text": block["text"]})
                elif kind == "tool_call":
                    parts.append(
                        {"function_call": {"name": block["name"], "args": block.get("args", {})}}
                    )
                elif kind == "tool_result":
                    parts.append(
                        {
                            "function_response": {
                                "name": block["name"],
                                "response": block.get("result", {}),
                            }
                        }
                    )
            if parts:
                # los function_response deben ir en un turno de usuario
                is_result = any("function_response" in p for p in parts)
                contents.append({"role": "user" if is_result else role, "parts": parts})
        return contents

    @staticmethod
    def _to_tools(tools: list[ToolSpec]) -> list[dict]:
        return [
            {
                "function_declarations": [
                    {
                        "name": t.name,
                        "description": t.description[:1024],
                        "parameters": sanitize_schema(t.schema),
                    }
                    for t in tools
                ]
            }
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
        from google.genai import types

        config: dict[str, Any] = {
            "system_instruction": system,
            "temperature": temperature,
        }
        if tools:
            config["tools"] = self._to_tools(tools)
            config["automatic_function_calling"] = types.AutomaticFunctionCallingConfig(
                disable=True
            )
        if json_mode:
            config["response_mime_type"] = "application/json"

        resp = await self._client.aio.models.generate_content(
            model=self.model,
            contents=self._to_contents(messages),
            config=types.GenerateContentConfig(**config),
        )
        calls = [
            ToolCall(id=fc.id or uuid.uuid4().hex[:8], name=fc.name, args=dict(fc.args or {}))
            for fc in (resp.function_calls or [])
        ]
        usage = {}
        if getattr(resp, "usage_metadata", None):
            usage = {
                "input_tokens": resp.usage_metadata.prompt_token_count,
                "output_tokens": resp.usage_metadata.candidates_token_count,
            }
        return Completion(
            text=("" if calls else (resp.text or "")),
            tool_calls=calls,
            usage=usage,
            provider=self.name,
            model=self.model,
        )
