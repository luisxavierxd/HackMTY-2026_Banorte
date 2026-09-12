"""Los proveedores: traducción neutral <-> nativo. Sin red, sin API key.

Es donde se rompe todo al cambiar de modelo, así que es donde hay que probar.
"""
import json

import pytest

from harness.agent.loop import extract_json, parse_prompted_calls
from harness.config import PROVIDER_PROFILES, Settings
from harness.providers import FakeProvider, ToolSpec, build_provider, text_msg
from harness.providers.anthropic_api import AnthropicProvider
from harness.providers.cli_agent import CliAgentProvider
from harness.providers.gemini import GeminiProvider

HISTORY = [
    text_msg("user", "quiero pagar menos intereses"),
    {"role": "assistant", "content": [
        {"type": "tool_call", "id": "t1", "name": "credito__saldo", "args": {"id": "TC-771"}}]},
    {"role": "user", "content": [
        {"type": "tool_result", "id": "t1", "name": "credito__saldo", "result": {"saldo": 18400}}]},
]
SPEC = ToolSpec("credito__saldo", "Saldo de la tarjeta",
                {"type": "object", "properties": {"id": {"type": "string"}}})


# ------------------------------- Gemini ------------------------------- #
def test_gemini_traduce_roles_y_partes():
    contents = GeminiProvider._to_contents(HISTORY)
    assert [c["role"] for c in contents] == ["user", "model", "user"]
    assert "function_call" in contents[1]["parts"][0]
    assert contents[2]["parts"][0]["function_response"]["response"] == {"saldo": 18400}


def test_gemini_sanitiza_el_esquema():
    tools = GeminiProvider._to_tools([SPEC])
    params = tools[0]["function_declarations"][0]["parameters"]
    assert params["type"] == "OBJECT"                 # mayúsculas, estilo OpenAPI
    assert params["properties"]["id"]["type"] == "STRING"


# ------------------------------ Anthropic ----------------------------- #
def test_anthropic_usa_bloques_tool_use_y_tool_result():
    msgs = AnthropicProvider._to_messages(HISTORY)
    assert msgs[1]["content"][0]["type"] == "tool_use"
    assert msgs[1]["content"][0]["id"] == "t1"
    result = msgs[2]["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "t1"
    assert json.loads(result["content"]) == {"saldo": 18400}


def test_anthropic_pasa_json_schema_sin_tocar():
    tools = AnthropicProvider._to_tools([SPEC])
    assert tools[0]["input_schema"] == SPEC.schema   # minúsculas, JSON Schema crudo


def test_los_dos_proveedores_nativos_declaran_la_misma_capacidad():
    assert GeminiProvider.native_tools is AnthropicProvider.native_tools is True


# ------------------------------- CLIs --------------------------------- #
def test_cli_construye_argv_de_claude_code():
    p = CliAgentProvider("claude_code", model="claude-sonnet-4-6")
    argv = p._argv("hola", "eres un agente")
    assert argv[0] == "claude" and "-p" in argv
    assert argv[argv.index("--output-format") + 1] == "json"
    assert "--bare" in argv
    assert argv[argv.index("--append-system-prompt") + 1] == "eres un agente"


def test_cli_antigravity_antepone_el_system_al_prompt():
    p = CliAgentProvider("antigravity")
    argv = p._argv("hola", "sys")
    assert argv[0] == "agy" and "--append-system-prompt" not in argv


def test_cli_no_delega_mcp_por_default():
    assert CliAgentProvider("claude_code", mcp_config="x.json").mcp_config is None
    assert CliAgentProvider("claude_code", mcp_config="x.json", delegate_mcp=True).mcp_config


def test_cli_extrae_texto_de_json_y_de_stream_json():
    p = CliAgentProvider("claude_code")
    assert p._extract('{"result":"listo","total_cost_usd":0.01}') == "listo"
    assert p._extract('{"type":"init"}\n{"result":"final"}') == "final"
    assert p._extract("texto pelón") == "texto pelón"


def test_cli_sin_function_calling_nativo():
    assert CliAgentProvider("claude_code").native_tools is False


# ------------------- tool calling por prompt (CLIs) ------------------- #
def test_parseo_de_tool_calls_por_prompt():
    calls, final = parse_prompted_calls(
        '```json\n{"tool_calls":[{"name":"credito__saldo","args":{"id":"TC-771"}}]}\n```')
    assert final == "" and calls[0].name == "credito__saldo"
    assert calls[0].args == {"id": "TC-771"}


def test_respuesta_final_sin_herramientas():
    calls, final = parse_prompted_calls('{"final":"Tu saldo es 18,400."}')
    assert calls == [] and "18,400" in final


def test_texto_libre_no_rompe_el_ciclo():
    calls, final = parse_prompted_calls("no encontré nada")
    assert calls == [] and final == "no encontré nada"


def test_extract_json_tolera_preambulo():
    assert extract_json('claro:\n{"a": 1}')["a"] == 1


# ------------------------------ registro ------------------------------ #
def test_perfiles_declaran_los_dos_roles():
    for name, profile in PROVIDER_PROFILES.items():
        assert {"reasoning", "ui"} <= set(profile), name
        assert profile["reasoning"]["provider"] and "model" in profile["reasoning"]


def test_el_perfil_fake_no_pide_credenciales(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    s = Settings()
    s.validate()
    assert isinstance(build_provider(s, "reasoning"), FakeProvider)


def test_perfil_hibrido_usa_proveedores_distintos(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "hybrid")
    s = Settings()
    assert s.provider_for("reasoning") != s.provider_for("ui")


def test_perfil_inexistente_falla_temprano(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gpt-inventado")
    with pytest.raises(SystemExit):
        Settings().validate()


def test_perfil_con_api_exige_su_llave(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    with pytest.raises(SystemExit):
        Settings().validate()


def test_override_de_modelo_por_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("REASONING_MODEL", "gemini-2.5-pro")
    assert Settings().model_for("reasoning") == "gemini-2.5-pro"


async def test_fake_llama_una_tool_y_luego_compone():
    p = FakeProvider()
    first = await p.complete(system="", messages=[text_msg("user", "hola")], tools=[SPEC])
    assert first.tool_calls[0].name == SPEC.name
    after = [text_msg("user", "hola"),
             {"role": "user", "content": [{"type": "tool_result", "id": "1",
                                           "name": SPEC.name, "result": {}}]}]
    second = await p.complete(system="", messages=after, tools=[SPEC], json_mode=True)
    assert json.loads(second.text)["root"] == "root"
