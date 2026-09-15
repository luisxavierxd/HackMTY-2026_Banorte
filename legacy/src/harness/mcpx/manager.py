"""Gestor de conexiones MCP (SDK python `mcp` 2.x).

Un solo objeto mantiene N servidores MCP vivos durante toda la vida del proceso
(no por sesión: abrir stdio por request es la causa #1 de demos lentas).
Soporta los dos transportes que importan hoy:
  - stdio            -> desarrollo local, un `python server.py`
  - streamable-http  -> producción/contenedores, escala horizontal

El namespacing `servidor__herramienta` evita colisiones cuando montas los 6
dominios del reto a la vez (credito__simular_plan vs banca__simular_plan).
"""

from __future__ import annotations

import logging
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any

from mcp import Client, StdioServerParameters

log = logging.getLogger("harness.mcp")

NS = "__"


@dataclass
class McpServerConfig:
    name: str
    transport: str  # "stdio" | "http"
    command: str | None = None
    args: list[str] | None = None
    url: str | None = None
    env: dict[str, str] | None = None


@dataclass
class ToolRef:
    server: str
    tool_name: str          # nombre real en el servidor
    qualified: str          # nombre expuesto al modelo
    description: str
    input_schema: dict[str, Any]


class McpManager:
    def __init__(self, configs: list[McpServerConfig]):
        self.configs = configs
        self._stack = AsyncExitStack()
        self.clients: dict[str, Client] = {}
        self.tools: dict[str, ToolRef] = {}

    async def start(self) -> None:
        for cfg in self.configs:
            try:
                client = await self._stack.enter_async_context(Client(self._target(cfg)))
                self.clients[cfg.name] = client
                await self._index_tools(cfg.name, client)
                log.info("MCP '%s' conectado (%s)", cfg.name, cfg.transport)
            except Exception as exc:  # un servidor caído no tumba el harness
                # ExceptionGroup (TaskGroup) oculta la causa real con str(exc);
                # log.exception saca el traceback completo, incluidas las
                # sub-excepciones anidadas, para poder diagnosticar en logs.
                log.exception("MCP '%s' no conectó: %s", cfg.name, exc)

    @staticmethod
    def _target(cfg: McpServerConfig) -> Any:
        """El Client 2.x acepta la URL directa o los parámetros de stdio."""
        if cfg.transport == "stdio":
            return StdioServerParameters(
                command=cfg.command or "python", args=cfg.args or [], env=cfg.env
            )
        if cfg.transport == "http":
            return cfg.url or ""
        raise ValueError(f"transporte MCP desconocido: {cfg.transport}")

    async def _index_tools(self, server: str, client: Client) -> None:
        listed = await client.list_tools()
        for tool in listed.tools:
            qualified = f"{server}{NS}{tool.name}"
            self.tools[qualified] = ToolRef(
                server=server,
                tool_name=tool.name,
                qualified=qualified,
                description=tool.description or "",
                input_schema=self._schema_of(tool),
            )

    @staticmethod
    def _schema_of(tool: Any) -> dict[str, Any]:
        """`input_schema` en mcp 2.x, `inputSchema` en 1.x: soportamos ambos."""
        schema = getattr(tool, "input_schema", None) or getattr(tool, "inputSchema", None)
        if hasattr(schema, "model_dump"):
            schema = schema.model_dump(by_alias=True, exclude_none=True)
        return schema or {"type": "object", "properties": {}}

    async def call(self, qualified: str, args: dict[str, Any]) -> dict[str, Any]:
        """Ejecuta una herramienta. Nunca lanza: el error vuelve al modelo como dato."""
        ref = self.tools.get(qualified)
        if ref is None:
            return {"error": f"herramienta desconocida: {qualified}"}
        client = self.clients.get(ref.server)
        if client is None:
            return {"error": f"servidor MCP '{ref.server}' no disponible"}
        try:
            result = await client.call_tool(ref.tool_name, args or {})
        except Exception as exc:
            log.exception("fallo en %s", qualified)
            return {"error": f"{type(exc).__name__}: {exc}"}

        structured = getattr(result, "structured_content", None) or getattr(
            result, "structuredContent", None
        )
        if structured:
            return structured
        chunks = [
            c.text for c in getattr(result, "content", []) if getattr(c, "type", None) == "text"
        ]
        payload: dict[str, Any] = {"content": "\n".join(chunks)}
        if getattr(result, "is_error", False) or getattr(result, "isError", False):
            payload["error"] = payload.pop("content")
        return payload

    async def aclose(self) -> None:
        await self._stack.aclose()
