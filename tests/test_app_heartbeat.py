"""Regresión de un bug real de producción: el heartbeat de /ws y /v1/turn
mataba el turno en silencio cuando un paso tardaba más que HEARTBEAT_S.

Causa: `asyncio.wait_for(agen.__anext__(), timeout=X)` CANCELA esa llamada
al vencerse el timeout. Un generador cancelado a medias no se "reintenta":
la siguiente llamada a `__anext__()` regresa `StopAsyncIteration` de inmediato,
como si ya hubiera terminado — sin ningún error. Con el CLI de Claude Code,
la fase de componer UI rutinariamente tarda más que el heartbeat, así que
esto mataba el turno cada vez, en silencio (ver notes/APRENDIZAJES_HARNESS.md).

Arreglo: `asyncio.wait` (no `wait_for`) sobre una Task persistente que nunca
se cancela — solo se espía, nunca se toca.
"""
from __future__ import annotations

import asyncio

import harness.app as app_module


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)


async def _lento_run_turn(session_id: str, payload: dict):
    """Simula un turno cuya fase de componer UI tarda más que el heartbeat."""
    yield {"type": "thinking", "text": "Diseñando la interfaz…"}
    await asyncio.sleep(0.6)  # > HEARTBEAT_S de prueba (0.2s)
    yield {"type": "surface", "title": "ok", "a2ui": [], "warnings": []}
    yield {"type": "turn_end", "latency_ms": 1}


async def test_drain_turn_sobrevive_un_paso_mas_lento_que_el_heartbeat(monkeypatch):
    monkeypatch.setattr(app_module, "HEARTBEAT_S", 0.2)
    monkeypatch.setattr(app_module, "run_turn", _lento_run_turn)

    ws = _FakeWebSocket()
    await app_module._drain_turn(ws, "s1", {"type": "user_message", "text": "hola"})

    types = [e["type"] for e in ws.sent]
    # el paso lento debe haber generado >=1 heartbeat, y el turno debe
    # llegar hasta el final (surface + turn_end), no morir a medias.
    assert "heartbeat" in types
    assert types[-2:] == ["surface", "turn_end"]


async def test_turn_sse_sobrevive_un_paso_mas_lento_que_el_heartbeat(monkeypatch):
    monkeypatch.setattr(app_module, "HEARTBEAT_S", 0.2)
    monkeypatch.setattr(app_module, "run_turn", _lento_run_turn)

    req = app_module.TurnRequest(session_id="s1", text="hola")
    response = await app_module.turn_sse(req)

    chunks = [c async for c in response.body_iterator]
    text = "".join(chunks)

    assert '"type": "heartbeat"' in text
    assert '"type":"surface"' in text or '"type": "surface"' in text
    assert text.strip().endswith("data: [DONE]")
