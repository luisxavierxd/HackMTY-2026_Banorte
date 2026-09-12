"""Configuración del harness.

**El proveedor y el modelo son flags de código, no una elección del usuario.**
Se fijan en `PROVIDER_PROFILES` y se selecciona uno con `LLM_PROVIDER` (env para
CI y Docker; el default vive aquí). Ningún endpoint, header ni mensaje del
WebSocket puede cambiarlos en caliente: un despliegue = un proveedor conocido,
que es lo que hace reproducible la demo y auditable el costo.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .mcpx.manager import McpServerConfig

ROOT = Path(__file__).resolve().parents[2]


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _bool(key: str, default: bool = False) -> bool:
    return _env(key, str(default)).lower() in ("1", "true", "yes", "on")


# --------------------------------------------------------------------------- #
# Perfiles de proveedor. Editar aquí es cambiar el comportamiento del harness.
#   reasoning -> quién interpreta la intención y decide herramientas
#   ui        -> quién compone el plan de interfaz
# Pueden ser distintos: razonar caro, componer barato.
# --------------------------------------------------------------------------- #
PROVIDER_PROFILES: dict[str, dict[str, Any]] = {
    "gemini": {
        "reasoning": {"provider": "gemini", "model": "gemini-2.5-flash"},
        "ui": {"provider": "gemini", "model": "gemini-2.5-flash"},
        "needs": "GOOGLE_API_KEY",
    },
    "anthropic": {
        "reasoning": {"provider": "anthropic", "model": "claude-sonnet-4-6"},
        "ui": {"provider": "anthropic", "model": "claude-sonnet-4-6"},
        "needs": "ANTHROPIC_API_KEY",
    },
    "claude_code": {  # demo con la suscripción local, sin API key
        "reasoning": {"provider": "claude_code", "model": ""},
        "ui": {"provider": "claude_code", "model": ""},
        "needs": None,
    },
    "antigravity": {  # demo con la cuenta de Google, sin API key
        "reasoning": {"provider": "antigravity", "model": ""},
        "ui": {"provider": "antigravity", "model": ""},
        "needs": None,
    },
    "hybrid": {  # razona con API, compone con el CLI local (o al revés)
        "reasoning": {"provider": "gemini", "model": "gemini-2.5-flash"},
        "ui": {"provider": "claude_code", "model": ""},
        "needs": "GOOGLE_API_KEY",
    },
    "fake": {
        "reasoning": {"provider": "fake", "model": "fake"},
        "ui": {"provider": "fake", "model": "fake"},
        "needs": None,
    },
}

#: perfil por defecto del despliegue. Cambiarlo aquí es la decisión de código.
DEFAULT_PROFILE = "gemini"


@dataclass
class Settings:
    # --- selección de proveedor (código, no usuario) ---
    profile: str = field(default_factory=lambda: _env("LLM_PROVIDER", DEFAULT_PROFILE))

    # --- credenciales ---
    google_api_key: str = field(default_factory=lambda: _env("GOOGLE_API_KEY"))
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))

    # --- overrides puntuales de modelo (opcionales) ---
    reasoning_model: str = field(default_factory=lambda: _env("REASONING_MODEL"))
    ui_model: str = field(default_factory=lambda: _env("UI_MODEL"))

    # --- CLIs agénticos ---
    cli_binary: str = field(default_factory=lambda: _env("CLI_BINARY"))
    cli_timeout_s: int = field(default_factory=lambda: int(_env("CLI_TIMEOUT_S", "180")))
    cli_delegate_mcp: bool = field(default_factory=lambda: _bool("CLI_DELEGATE_MCP", False))
    cli_mcp_config: str = field(default_factory=lambda: _env("CLI_MCP_CONFIG"))
    cli_extra_args: list[str] = field(
        default_factory=lambda: [a for a in _env("CLI_EXTRA_ARGS").split() if a]
    )

    # --- generación ---
    temperature: float = field(default_factory=lambda: float(_env("TEMPERATURE", "0.2")))
    ui_temperature: float = field(default_factory=lambda: float(_env("UI_TEMPERATURE", "0.4")))
    max_output_tokens: int = field(default_factory=lambda: int(_env("MAX_OUTPUT_TOKENS", "4096")))

    # --- presupuestos (protegen la demo) ---
    max_tool_steps: int = field(default_factory=lambda: int(_env("MAX_TOOL_STEPS", "6")))
    max_components: int = field(default_factory=lambda: int(_env("MAX_COMPONENTS", "24")))
    max_trace_items: int = field(default_factory=lambda: int(_env("MAX_TRACE_ITEMS", "8")))
    max_history_turns: int = field(default_factory=lambda: int(_env("MAX_HISTORY_TURNS", "24")))

    # --- producto ---
    domain: str = field(default_factory=lambda: _env("DOMAIN", "credito"))
    surface_id: str = field(default_factory=lambda: _env("SURFACE_ID", "main"))

    # --- infra ---
    cors_origins: list[str] = field(
        default_factory=lambda: [o for o in _env("CORS_ORIGINS", "*").split(",") if o]
    )
    session_backend: str = field(default_factory=lambda: _env("SESSION_BACKEND", "memory"))
    redis_url: str = field(default_factory=lambda: _env("REDIS_URL", ""))
    session_ttl_s: int = field(default_factory=lambda: int(_env("SESSION_TTL_S", "3600")))

    # ------------------------------------------------------------------ #
    @property
    def _profile(self) -> dict[str, Any]:
        if self.profile not in PROVIDER_PROFILES:
            raise SystemExit(
                f"LLM_PROVIDER='{self.profile}' no existe. "
                f"Opciones: {', '.join(PROVIDER_PROFILES)}"
            )
        return PROVIDER_PROFILES[self.profile]

    def provider_for(self, role: str) -> str:
        return self._profile[role]["provider"]

    def model_for(self, role: str) -> str:
        override = self.reasoning_model if role == "reasoning" else self.ui_model
        return override or self._profile[role]["model"]

    def validate(self) -> None:
        needs = self._profile.get("needs")
        if needs and not getattr(self, needs.lower(), ""):
            raise SystemExit(
                f"El perfil '{self.profile}' requiere {needs}.\n"
                f"  · Gemini:    https://aistudio.google.com/apikey\n"
                f"  · Anthropic: https://console.anthropic.com/settings/keys\n"
                f"  · Sin key:   LLM_PROVIDER=claude_code | antigravity | fake"
            )

    def summary(self) -> str:
        return (
            f"perfil={self.profile} "
            f"razona={self.provider_for('reasoning')}:{self.model_for('reasoning') or 'default'} "
            f"ui={self.provider_for('ui')}:{self.model_for('ui') or 'default'}"
        )


def load_mcp_servers() -> list[McpServerConfig]:
    """Registro de servidores MCP.

    Por defecto lee mcp_servers.json; si no existe, levanta los dominios
    locales por stdio. MCP_SERVERS (JSON inline) gana sobre ambos.
    """
    raw = _env("MCP_SERVERS")
    if not raw:
        cfg_file = ROOT / "mcp_servers.json"
        if cfg_file.exists():
            raw = cfg_file.read_text(encoding="utf-8")
    if raw:
        return [McpServerConfig(**item) for item in json.loads(raw)["servers"]]

    return [
        McpServerConfig(
            name="credito",
            transport="stdio",
            command=sys.executable,
            args=[str(ROOT / "mcp_servers" / "credito" / "server.py")],
        ),
        McpServerConfig(
            name="banca",
            transport="stdio",
            command=sys.executable,
            args=[str(ROOT / "mcp_servers" / "banca" / "server.py")],
        ),
    ]
