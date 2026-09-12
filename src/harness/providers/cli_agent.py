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
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Any

from .base import Completion, Message, ToolSpec

log = logging.getLogger("harness.provider.cli")

#: evento de progreso que el harness puede convertir en un "thinking" visible
#: en el chat mientras el CLI sigue corriendo (turnos largos, 10-180s).
ProgressCallback = Callable[[dict[str, Any]], Awaitable[None]]


class CliAgentProvider:
    native_tools = False  # tool calling por prompt, ejecutado por el harness

    #: cada CLI trae su propia gramática de flags
    PRESETS: dict[str, dict[str, Any]] = {
        "claude_code": {
            "binary": "claude",
            "prompt_flag": "-p",
            # stream-json (NDJSON, una línea por evento) en vez de json plano:
            # deja ver progreso real mientras el CLI trabaja, en vez de una
            # caja negra hasta que el proceso termina. SOLO afecta este preset
            # — antigravity y las APIs (anthropic/gemini) no se tocan.
            "json_flags": ["--output-format", "stream-json", "--verbose"],
            "streaming": True,
            "system_flag": "--append-system-prompt",
            "model_flag": "--model",
            "mcp_flag": "--mcp-config",
            # OJO: NO agregar --bare aquí. --bare hace que el CLI ignore las
            # credenciales OAuth / keychain (ver docs de Claude Code) — con
            # el perfil claude_code el punto es usar la sesión ya logueada
            # (suscripción, sin API key), así que --bare rompe la autenticación
            # por completo (falla con "salió con 1" y sin mensaje útil).
            "extra": [],
            "text_keys": ["result", "structured_output", "text"],
        },
        "antigravity": {
            "binary": "agy",
            "prompt_flag": "-p",
            "json_flags": ["--output-format", "json"],
            "streaming": False,  # formato/eventos de agy no verificados; no tocar
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

    def _text_from_payload(self, payload: dict[str, Any]) -> str:
        for key in self.cfg["text_keys"]:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value
            if isinstance(value, dict):
                return json.dumps(value, ensure_ascii=False)
        return ""

    def _extract(self, stdout: str) -> str:
        """Modo NO streaming (antigravity): todo el stdout llega de golpe."""
        stdout = stdout.strip()
        if not stdout:
            return ""
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            # texto plano o NDJSON suelto: quédate con la última línea JSON útil
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
        return self._text_from_payload(payload) or stdout

    @staticmethod
    def _humanize_stream_event(ev: dict[str, Any]) -> dict[str, Any] | None:
        """Traduce un evento NDJSON de `claude --output-format stream-json` a
        un `{"type":"thinking", ...}` que el frontend ya sabe mostrar (Trace.tsx).

        A PROPÓSITO genérico: nunca incluye texto/JSON crudo del modelo. En
        la fase de componer UI, ese "texto" es literalmente el JSON del plan
        (`{"title": "...", "components": [...`) — mostrárselo al usuario se
        vería como código roto, no como progreso. El detalle completo (para
        debugging) se loguea aparte, ver `_run_streaming`."""
        kind = ev.get("type")
        if kind == "system" and ev.get("subtype") == "init":
            return {"type": "thinking", "text": "Conectando con el modelo…"}
        if kind == "assistant":
            content = (ev.get("message") or {}).get("content") or []
            if any(b.get("type") == "text" and (b.get("text") or "").strip() for b in content):
                return {"type": "thinking", "text": "Generando la respuesta…"}
        return None

    async def _run_streaming(
        self, argv: list[str], on_event: ProgressCallback | None
    ) -> tuple[int, str, bytes]:
        """Lee stdout línea por línea (NDJSON) mientras el proceso corre, en vez
        de esperar a que termine (`communicate()`). Permite emitir progreso real
        turno a turno; nunca se usa para antigravity ni para las APIs."""
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            # default de asyncio es 64 KiB por línea: el plan de UI completo
            # (con series de hasta 600 puntos, ver riesgos conocidos del
            # frontend) va embebido en una sola línea NDJSON y puede excederlo.
            limit=1024 * 1024,
        )
        stderr_task = asyncio.ensure_future(proc.stderr.read())
        final_text = ""
        is_error = False
        saw_result = False
        reaped = False
        try:
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = raw.decode(errors="replace").strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                # Detalle completo SOLO en logs del servidor (Railway) — lo que
                # ve el usuario en el chat es genérico, ver _humanize_stream_event.
                log.info("cli stream[%s]: %s", self.name, line[:500])
                if ev.get("type") == "result":
                    final_text = self._text_from_payload(ev)
                    is_error = bool(ev.get("is_error"))
                    saw_result = True
                    # No sigas esperando más líneas: ya tenemos lo que
                    # necesitamos. Si el proceso tarda en salir del todo
                    # después de imprimir "result" (teardown, telemetría),
                    # seguir bloqueado en readline() se ve exactamente como
                    # "no pasa nada" del lado del usuario — visto en producción.
                    break
                elif on_event is not None:
                    progress = self._humanize_stream_event(ev)
                    if progress:
                        await on_event(progress)

            if saw_result:
                # Ya tenemos lo que importa: regresa YA, sin esperar a que el
                # proceso salga del todo — el `result` de la CLI trae su propio
                # `is_error`, así que ni siquiera necesitamos el returncode del
                # SO. Se reapea aparte para no dejar zombies, sin bloquear.
                reaped = True
                asyncio.ensure_future(self._reap(proc, stderr_task))
                return (1 if is_error else 0), final_text, b""

            log.warning("cli stream[%s]: terminó sin evento 'result'", self.name)
            returncode = await proc.wait()
            stderr = await stderr_task
            return returncode, final_text, stderr
        finally:
            if not reaped:
                if proc.returncode is None:  # timeout/cancelación: no dejar zombies
                    proc.kill()
                if not stderr_task.done():
                    stderr_task.cancel()

    @staticmethod
    async def _reap(proc: asyncio.subprocess.Process, stderr_task: asyncio.Task) -> None:
        """Termina de esperar al proceso en segundo plano, sin bloquear al
        turno que ya tiene su resultado."""
        with suppress(Exception):
            await proc.wait()
        with suppress(Exception):
            if not stderr_task.done():
                await stderr_task

    # ------------------------------------------------------------------ #
    async def complete(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        json_mode: bool = False,
        temperature: float = 0.2,  # los CLIs no lo exponen; se ignora
        on_event: ProgressCallback | None = None,
        **_: Any,
    ) -> Completion:
        prompt = self._flatten(messages)
        if json_mode:
            prompt += "\n\nResponde ÚNICAMENTE con el objeto JSON, sin markdown ni explicación."
        if not self.cfg["system_flag"] and system:
            prompt = f"{system}\n\n---\n{prompt}"

        argv = self._argv(prompt, system)

        try:
            if self.cfg.get("streaming"):
                returncode, text, err = await asyncio.wait_for(
                    self._run_streaming(argv, on_event), timeout=self.timeout_s
                )
            else:
                proc = await asyncio.create_subprocess_exec(
                    *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                out, err = await asyncio.wait_for(proc.communicate(), timeout=self.timeout_s)
                returncode = proc.returncode
                text = self._extract(out.decode())
        except asyncio.TimeoutError:
            raise RuntimeError(f"{self.binary} excedió {self.timeout_s}s") from None

        if returncode != 0:
            # El error real a veces sale por stdout (ej. flag inválido para
            # esta versión del CLI) y stderr queda vacío — mostrar ambos.
            detail = err.decode(errors="replace")[:800]
            raise RuntimeError(
                f"{self.binary} salió con {returncode} "
                f"(argv={self._argv('<prompt omitido>', '<system omitido>')}): {detail}"
            )

        return Completion(
            text=text,
            tool_calls=[],  # las decide el ciclo parseando el JSON del texto
            usage={"transport": "cli"},
            provider=self.name,
            model=self.model or "(cuenta local)",
        )
