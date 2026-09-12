"""Los proveedores: traducción neutral <-> nativo. Sin red, sin API key.

Es donde se rompe todo al cambiar de modelo, así que es donde hay que probar.
"""
import asyncio
import json

import pytest

from harness.agent.loop import _complete_stream, extract_json, parse_prompted_calls
from harness.config import PROVIDER_PROFILES, Settings
from harness.providers import Completion, FakeProvider, ToolSpec, build_provider, text_msg
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
    # stream-json + --verbose: deja ver progreso real del CLI en vez de
    # bloquear a ciegas hasta que el proceso termine.
    assert argv[argv.index("--output-format") + 1] == "stream-json"
    assert "--verbose" in argv
    # --bare NO debe usarse aquí: le dice al CLI que ignore las credenciales
    # OAuth (login de la suscripción), que es justo lo que este perfil necesita.
    assert "--bare" not in argv
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


# --------------------- progreso en vivo (stream-json) ------------------ #
def test_humaniza_evento_system_init():
    ev = CliAgentProvider._humanize_stream_event({"type": "system", "subtype": "init"})
    assert ev == {"type": "thinking", "text": "Conectando con el modelo…"}


def test_humaniza_evento_assistant_es_generico_nunca_expone_el_texto_del_modelo():
    # A propósito: en la fase de componer UI ese "texto" es el JSON del plan
    # ({"title": ...) — mostrárselo al usuario se vería como código roto.
    texto_del_modelo = '{"title": "Reestructura", "components": [{"id": "root"'
    ev = CliAgentProvider._humanize_stream_event(
        {"type": "assistant", "message": {"content": [{"type": "text", "text": texto_del_modelo}]}}
    )
    assert ev == {"type": "thinking", "text": "Generando la respuesta…"}
    assert texto_del_modelo not in ev["text"]


def test_humaniza_evento_ignora_lo_que_no_es_texto_util():
    assert CliAgentProvider._humanize_stream_event({"type": "result"}) is None
    assert CliAgentProvider._humanize_stream_event({"type": "system", "subtype": "other"}) is None
    assert CliAgentProvider._humanize_stream_event({"type": "assistant", "message": {}}) is None


class _FakeStdout:
    def __init__(self, lines: list[bytes]):
        self._lines = [*lines, b""]  # b"" = EOF

    async def readline(self) -> bytes:
        return self._lines.pop(0)


class _FakeStderr:
    async def read(self) -> bytes:
        return b""


class _FakeProc:
    """Doble mínimo de asyncio.subprocess.Process para probar _run_streaming
    sin lanzar un proceso de verdad (multiplataforma, sin red)."""

    def __init__(self, lines: list[bytes]):
        self.stdout = _FakeStdout(lines)
        self.stderr = _FakeStderr()
        self.returncode: int | None = None

    async def wait(self) -> int:
        self.returncode = 0
        return 0

    def kill(self) -> None:
        self.returncode = -9


async def test_run_streaming_llama_on_event_y_extrae_result(monkeypatch):
    lines = [
        b'{"type":"system","subtype":"init"}\n',
        b'{"type":"assistant","message":{"content":[{"type":"text","text":"Pensando tu meta de ahorro"}]}}\n',
        b'{"type":"result","result":"listo"}\n',
    ]
    fake_proc = _FakeProc(lines)

    async def fake_create_subprocess_exec(*_args, **_kwargs):
        return fake_proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    p = CliAgentProvider("claude_code")
    events: list[dict] = []

    async def on_event(ev: dict) -> None:
        events.append(ev)

    returncode, text, err = await p._run_streaming(["claude", "-p", "x"], on_event)

    assert returncode == 0
    assert text == "listo"
    assert err == b""
    assert events[0]["text"] == "Conectando con el modelo…"
    assert events[1]["text"] == "Generando la respuesta…"
    assert "Pensando tu meta de ahorro" not in events[1]["text"]  # nunca texto crudo al usuario


async def test_run_streaming_sin_on_event_no_truena(monkeypatch):
    lines = [b'{"type":"assistant","message":{"content":[{"type":"text","text":"hola"}]}}\n']
    fake_proc = _FakeProc(lines)

    async def fake_create_subprocess_exec(*_args, **_kwargs):
        return fake_proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)
    p = CliAgentProvider("claude_code")
    returncode, text, _err = await p._run_streaming(["claude"], None)
    assert returncode == 0
    assert text == ""  # no hubo evento "result"


# ---------------- _complete_stream (agent/loop.py) ---------------------- #
async def test_complete_stream_relay_progreso_de_proveedor_cli(monkeypatch):
    provider = CliAgentProvider("claude_code")  # cfg["streaming"] es True

    async def fake_complete(**kwargs):
        on_event = kwargs["on_event"]
        await on_event({"type": "thinking", "text": "paso 1"})
        await on_event({"type": "thinking", "text": "paso 2"})
        return Completion(text="ok", provider="claude_code", model="")

    monkeypatch.setattr(provider, "complete", fake_complete)

    items = [item async for item in _complete_stream(provider, system="s", messages=[])]

    assert [i["text"] for i in items[:-1]] == ["paso 1", "paso 2"]
    assert isinstance(items[-1], Completion) and items[-1].text == "ok"


async def test_complete_stream_proveedor_sin_streaming_es_un_solo_await():
    # fake / anthropic / gemini / antigravity: ni una vuelta de cola, cero
    # cambio de comportamiento frente al await directo de antes del refactor.
    items = [
        item
        async for item in _complete_stream(FakeProvider(), system="s", messages=[], json_mode=True)
    ]
    assert len(items) == 1
    assert isinstance(items[0], Completion)


async def test_complete_stream_antigravity_no_usa_la_cola_de_progreso(monkeypatch):
    provider = CliAgentProvider("antigravity")  # cfg["streaming"] es False

    async def fake_complete(**kwargs):
        assert "on_event" not in kwargs  # nunca se le pasa: no soporta progreso
        return Completion(text="ok", provider="antigravity", model="")

    monkeypatch.setattr(provider, "complete", fake_complete)

    items = [item async for item in _complete_stream(provider, system="s", messages=[])]
    assert len(items) == 1 and items[0].text == "ok"


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
