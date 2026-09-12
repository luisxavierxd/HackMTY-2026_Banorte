"""Proveedores "CLI agéntico": Claude Code (`claude`) y Antigravity (`agy`).

Para qué existe: correr la demo completa **sin API key de pago**, usando la
suscripción que el equipo ya tiene en su máquina. Mismo ciclo, mismo MCP, mismo
A2UI; solo cambia quién genera el texto.

Cómo funciona: los dos CLIs exponen modo headless con salida estructurada
    claude -p "<prompt>" --output-format json [--append-system-prompt ...]
    agy    -p "<prompt>" --output-format json
Se invocan como subproceso, se lee el JSON de stdout y se extrae el texto.

Tool calling: estos CLIs no exponen la API de function calling del modelo al
proceso que los llama, así que `native_tools = False` y el ciclo del agente usa
**tool calling por prompt** (ver `agent/prompts.py::tool_manifest_prompt`): el
manifiesto de herramientas viaja en el system prompt y el CLI responde con un
JSON `{"tool_calls":[...]}` que el harness ejecuta contra SUS servidores MCP.
Así el MCP sigue siendo del equipo y la traza sigue siendo auditable.

Alternativa (`delegate_mcp=True`): pasarle al CLI nuestro `mcp_servers.json` con
`--mcp-config` y dejar que él ejecute las tools. Se gana fidelidad agéntica y se
pierde la traza intermedia, que es justo lo que alimenta la composición de UI.
Por eso el default es False.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from typing import Any

from .base import Completion, Message, ToolSpec

log = logging.getLogger("harness.provider.cli")


class CliAgentProvider:
    native_tools = False  # tool calling por prompt, ejecutado por el harness

    #: cada CLI trae su propia gramática de flags
    PRESETS: dict[str, dict[str, Any]] = {
        "claude_code": {
            "binary": "claude",
            "prompt_flag": "-p",
            "json_flags": ["--output-format", "json"],
            "system_flag": "--append-system-prompt",
            "model_flag": "--model",
            "mcp_flag": "--mcp-config",
            "extra": ["--bare"],  # sin CLAUDE.md, hooks ni plugins: turnos baratos
            "text_keys": ["result", "structured_output", "text"],
        },
        "antigravity": {
            "binary": "agy",
            "prompt_flag": "-p",
            "json_flags": ["--output-format", "json"],
            "system_flag": None,  # no expone system prompt: se antepone al prompt
            "model_flag": "--model",
            "mcp_flag": "--mcp-config",
            "extra": [],
            "text_keys": ["result", "response", "output", "text"],
        },
    }

    def __init__(
        self,
        preset: str,
        model: str = "",
        binary: str | None = None,
        timeout_s: int = 180,
        mcp_config: str | None = None,
        delegate_mcp: bool = False,
        extra_args: list[str] | None = None,
    ):
        if preset not in self.PRESETS:
            raise ValueError(f"preset de CLI desconocido: {preset}")
        self.name = preset
        self.cfg = dict(self.PRESETS[preset])
        self.binary = binary or self.cfg["binary"]
        self.model = model
        self.timeout_s = timeout_s
        self.mcp_config = mcp_config if delegate_mcp else None
        self.extra_args = extra_args or []

    def check(self) -> None:
        """Falla temprano y con un mensaje útil, no a media demo."""
        if shutil.which(self.binary) is None:
            raise SystemExit(
                f"'{self.binary}' no está en el PATH. "
                f"Instálalo o cambia LLM_PROVIDER en la configuración."
            )

    # ------------------------------------------------------------------ #
    @staticmethod
    def _flatten(messages: list[Message]) -> str:
        """La conversación va en un solo prompt: el CLI es sin estado entre llamadas."""
        lines: list[str] = []
        for msg in messages:
            who = "USUARIO" if msg["role"] == "user" else "AGENTE"
            for block in msg.get("content", []):
                kind = block.get("type")
                if kind == "text":
                    lines.append(f"{who}: {block['text']}")
                elif kind == "tool_call":
                    lines.append(
                        f"AGENTE llamó {block['name']}({json.dumps(block.get('args', {}), ensure_ascii=False)})"
                    )
                elif kind == "tool_result":
                    payload = json.dumps(block.get("result", {}), ensure_ascii=False)
                    lines.append(f"RESULTADO {block['name']}: {payload[:4000]}")
        return "\n".join(lines)

    def _argv(self, prompt: str, system: str) -> list[str]:
        cfg = self.cfg
        argv = [self.binary, cfg["prompt_flag"], prompt, *cfg["json_flags"], *cfg["extra"]]
        if system and cfg["system_flag"]:
            argv += [cfg["system_flag"], system]
        if self.model and cfg["model_flag"]:
            argv += [cfg["model_flag"], self.model]
        if self.mcp_config and cfg["mcp_flag"]:
            argv += [cfg["mcp_flag"], self.mcp_config]
        return argv + self.extra_args

    def _extract(self, stdout: str) -> str:
        stdout = stdout.strip()
        if not stdout:
            return ""
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            # stream-json o texto plano: quédate con la última línea JSON útil
            for line in reversed(stdout.splitlines()):
                try:
                    payload = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue
            else:
                return stdout
        if isinstance(payload, str):
            return payload
        for key in self.cfg["text_keys"]:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value
            if isinstance(value, dict):
                return json.dumps(value, ensure_ascii=False)
        return stdout

    # ------------------------------------------------------------------ #
    async def complete(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        json_mode: bool = False,
        temperature: float = 0.2,  # los CLIs no lo exponen; se ignora
        **_: Any,
    ) -> Completion:
        prompt = self._flatten(messages)
        if json_mode:
            prompt += "\n\nResponde ÚNICAMENTE con el objeto JSON, sin markdown ni explicación."
        if not self.cfg["system_flag"] and system:
            prompt = f"{system}\n\n---\n{prompt}"

        proc = await asyncio.create_subprocess_exec(
            *self._argv(prompt, system),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=self.timeout_s)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"{self.binary} excedió {self.timeout_s}s") from None

        if proc.returncode != 0:
            raise RuntimeError(f"{self.binary} salió con {proc.returncode}: {err.decode()[:400]}")

        return Completion(
            text=self._extract(out.decode()),
            tool_calls=[],  # las decide el ciclo parseando el JSON del texto
            usage={"transport": "cli"},
            provider=self.name,
            model=self.model or "(cuenta local)",
        )
