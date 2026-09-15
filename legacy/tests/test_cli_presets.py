"""Presets de CLI agregados después del hackatón: `cursor` y `codex`.

Los flags salieron de documentación oficial, no de correr los binarios (no
estaban instalados al escribirlos). Estos tests fijan lo que el harness cree
que son, para que si alguien los corrige con el binario en mano se vea el
cambio explícito en vez de un turno que falla en silencio.

También verifican que los presets viejos (`claude_code`, `antigravity`) no se
movieron: el harness del hackatón tiene que seguir corriendo igual.
"""

import json

from harness.config import PROVIDER_PROFILES
from harness.providers.cli_agent import CliAgentProvider


def argv_of(preset: str, model: str = "") -> list[str]:
    return CliAgentProvider(preset=preset, model=model)._argv("PROMPT", "SYSTEM")


# ── los presets viejos no se movieron ──────────────────────────────────


def test_claude_code_sigue_igual():
    argv = argv_of("claude_code")
    assert argv[:3] == ["claude", "-p", "PROMPT"]
    assert "--output-format" in argv and "stream-json" in argv
    # el system prompt va por flag, no pegado al prompt
    assert "--append-system-prompt" in argv


def test_antigravity_sigue_igual():
    argv = argv_of("antigravity")
    assert argv[:3] == ["agy", "-p", "PROMPT"]
    assert "--append-system-prompt" not in argv  # no expone system prompt


# ── cursor ─────────────────────────────────────────────────────────────


def test_cursor_invoca_headless_con_json():
    argv = argv_of("cursor")
    assert argv[:3] == ["cursor-agent", "-p", "PROMPT"]
    assert "--output-format" in argv and "stream-json" in argv


def test_cursor_trae_los_flags_que_evitan_quedarse_esperando():
    # Sin --force/--trust el CLI pide aprobación y el turno se va a timeout.
    argv = argv_of("cursor")
    assert "--force" in argv
    assert "--trust" in argv


def test_cursor_antepone_el_system_prompt_al_no_tener_flag():
    cfg = CliAgentProvider.PRESETS["cursor"]
    assert cfg["system_flag"] is None


def test_cursor_declara_que_necesita_key():
    assert PROVIDER_PROFILES["cursor"]["needs"] == "CURSOR_API_KEY"


# ── codex ──────────────────────────────────────────────────────────────


def test_codex_usa_subcomando_exec_no_flag():
    # `codex exec "<prompt>"`: posicionalmente igual que `claude -p`, por eso
    # entra en la misma construcción de argv sin cambiarla.
    argv = argv_of("codex")
    assert argv[:3] == ["codex", "exec", "PROMPT"]


def test_codex_pide_json_y_sandbox_escribible():
    argv = argv_of("codex")
    assert "--json" in argv
    # el default es read-only y pide aprobación: sin esto no avanza
    assert "--sandbox" in argv and "workspace-write" in argv


def test_codex_arma_el_texto_de_los_eventos_item_completed():
    """El texto de codex NO está en el objeto raíz del NDJSON."""
    provider = CliAgentProvider(preset="codex")
    stdout = "\n".join(
        json.dumps(x)
        for x in [
            {"type": "thread.started", "thread_id": "t1"},
            {"type": "item.completed", "item": {"type": "reasoning", "text": "primero"}},
            {"type": "item.completed", "item": {"type": "message", "text": "segundo"}},
            {"type": "turn.completed", "usage": {}},
        ]
    )
    assert provider._extract(stdout) == "primero\nsegundo"


def test_codex_ignora_lineas_que_no_son_json():
    """El CLI puede escribir avisos sueltos; no deben tirar el turno."""
    provider = CliAgentProvider(preset="codex")
    stdout = "\n".join([
        "warning: algo no fatal",
        json.dumps({"type": "item.completed", "item": {"text": "útil"}}),
        "",
    ])
    assert provider._extract(stdout) == "útil"


def test_codex_sin_items_devuelve_vacio_en_vez_de_tronar():
    provider = CliAgentProvider(preset="codex")
    assert provider._extract(json.dumps({"type": "turn.completed"})) == ""
    assert provider._extract("") == ""


def test_la_extraccion_ndjson_no_afecta_a_los_otros_presets():
    """Solo codex la usa; antigravity sigue leyendo el objeto raíz."""
    assert CliAgentProvider(preset="antigravity")._extract('{"result":"hola"}') == "hola"
    assert CliAgentProvider.PRESETS["claude_code"].get("ndjson_items") is None


# ── los cuatro CLIs son perfiles válidos ───────────────────────────────


def test_los_cuatro_clis_estan_en_los_perfiles():
    for name in ("claude_code", "antigravity", "cursor", "codex"):
        assert name in PROVIDER_PROFILES, name
        assert PROVIDER_PROFILES[name]["reasoning"]["provider"] == name
