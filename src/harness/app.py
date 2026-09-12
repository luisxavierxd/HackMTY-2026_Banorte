"""Superficie HTTP del harness. Es el contrato con el frontend.

    GET  /healthz                 liveness
    GET  /readyz                  incluye estado de cada servidor MCP
    GET  /a2ui/catalog.json       catálogo de componentes (el front lo consume al boot)
    GET  /a2ui/tools              herramientas MCP montadas (útil para la demo técnica)
    WS   /ws/{session_id}         canal principal, bidireccional
    POST /v1/turn                 mismo ciclo, respuesta SSE (sin WS, para curl/serverless)

El frontend solo necesita: leer el catálogo, abrir el WS, mandar
{"type":"user_message"|"action"} y renderizar los envelopes A2UI que recibe.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .a2ui.catalog import CATALOG_ID, catalog_document
from .a2ui.messages import pointer_set
from .agent.loop import Agent
from .config import Settings, load_mcp_servers
from .mcpx.manager import McpManager
from .session.store import build_store

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s | %(message)s"
)
log = logging.getLogger("harness")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    settings.validate()
    mcp = McpManager(load_mcp_servers())
    await mcp.start()
    app.state.settings = settings
    app.state.mcp = mcp
    app.state.agent = Agent(settings, mcp)
    app.state.store = build_store(
        settings.session_backend, settings.redis_url, settings.session_ttl_s
    )
    log.info(
        "harness listo | %s | %s herramientas | sesiones=%s",
        settings.summary(),
        len(mcp.tools),
        settings.session_backend,
    )
    try:
        yield
    finally:
        await mcp.aclose()


app = FastAPI(title="GenUI Harness", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=Settings().cors_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# metadatos
# --------------------------------------------------------------------------- #
@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}


@app.get("/readyz")
async def readyz() -> JSONResponse:
    mcp: McpManager = app.state.mcp
    expected = {c.name for c in mcp.configs}
    live = set(mcp.clients)
    body = {
        "status": "ok" if expected == live else "degraded",
        "llm": app.state.agent.describe(),
        "mcp": {name: ("up" if name in live else "down") for name in sorted(expected)},
        "tools": sorted(mcp.tools),
        "catalogId": CATALOG_ID,
    }
    return JSONResponse(body, status_code=200 if body["status"] == "ok" else 503)


@app.get("/a2ui/catalog.json")
async def catalog() -> dict:
    return catalog_document()


@app.get("/a2ui/tools")
async def tools() -> dict:
    mcp: McpManager = app.state.mcp
    return {
        "tools": [
            {"name": t.qualified, "server": t.server, "description": t.description}
            for t in mcp.tools.values()
        ]
    }


# --------------------------------------------------------------------------- #
# ciclo del turno
# --------------------------------------------------------------------------- #
def action_to_prompt(name: str, params: dict, data_model: dict) -> str:
    """Cierra el ciclo: lo que la persona tocó regresa al agente como contexto."""
    return (
        f"[EVENTO_UI] La persona interactuó con la interfaz generada.\n"
        f"accion: {name}\n"
        f"params: {json.dumps(params, ensure_ascii=False)}\n"
        f"estado_actual_de_la_pantalla: {json.dumps(data_model, ensure_ascii=False)}\n"
        f"Ejecuta lo que corresponda con las herramientas y devuelve la nueva pantalla."
    )


async def run_turn(session_id: str, payload: dict[str, Any]):
    settings: Settings = app.state.settings
    store = app.state.store
    agent: Agent = app.state.agent

    session = await store.get(session_id, settings.domain)
    kind = payload.get("type", "user_message")

    # el cliente puede reportar cambios del data model (sendDataModel=true)
    for path, value in (payload.get("dataModel") or {}).items():
        pointer_set(session.data_model, path, value)

    if kind == "action":
        name = payload.get("name") or payload.get("action") or "accion"
        text = action_to_prompt(name, payload.get("params") or {}, session.data_model)
        yield {"type": "ack", "action": name}
    else:
        text = payload.get("text", "")
        if not text:
            yield {"type": "error", "message": "mensaje vacío"}
            return

    first_render = not session.rendered
    async for event in agent.run_turn(
        session.history, text, session.domain, first_render, session.data_model
    ):
        if event["type"] == "surface":
            session.rendered = True
        yield event

    session.trim(settings.max_history_turns)
    await store.put(session)


# --------------------------------------------------------------------------- #
# transportes
# --------------------------------------------------------------------------- #

#: si un turno pasa más de esto sin producir un evento (normal con el CLI de
#: Claude Code: 10-40s), se manda un heartbeat. Sin esto, proxies como el de
#: Railway cierran el WS por inactividad a la mitad de un turno largo — la
#: respuesta se genera bien del lado del harness pero se pierde en el aire
#: porque el cliente ya reconectó con un socket nuevo (visto en producción).
HEARTBEAT_S = 15


async def _drain_turn(ws: WebSocket, session_id: str, payload: dict) -> None:
    """Consume run_turn mandando un heartbeat si tarda, SIN cancelar el paso
    en curso.

    OJO — bug real que costó varias corridas de producción: `asyncio.wait_for`
    sobre `agen.__anext__()` CANCELA esa llamada si se pasa del timeout. Una
    corrutina/generador cancelado a medias no se puede "reintentar" — la
    siguiente llamada a `__anext__()` regresa `StopAsyncIteration` de inmediato,
    como si ya hubiera terminado, sin ningún error. Con el CLI, la fase de
    componer UI casi siempre tarda más de HEARTBEAT_S, así que el heartbeat
    mataba el turno en silencio cada vez — el navegador se quedaba esperando
    para siempre sin ningún error que ver. Confirmado con un repro aislado
    (ver notes/APRENDIZAJES_HARNESS.md). Por eso aquí se usa `asyncio.wait`
    (no `wait_for`) sobre una Task persistente que nunca se cancela."""
    agen = run_turn(session_id, payload).__aiter__()
    while True:
        next_task = asyncio.ensure_future(agen.__anext__())
        while True:
            done, _pending = await asyncio.wait({next_task}, timeout=HEARTBEAT_S)
            if next_task in done:
                break
            await ws.send_json({"type": "heartbeat"})
        try:
            event = next_task.result()
        except StopAsyncIteration:
            return
        await ws.send_json(event)
        if event.get("type") in ("surface", "turn_end", "error"):
            log.info("ws send OK: %s (sesión %s)", event["type"], session_id)


@app.websocket("/ws/{session_id}")
async def ws_endpoint(ws: WebSocket, session_id: str):
    await ws.accept()
    await ws.send_json({"type": "ready", "catalogId": CATALOG_ID, "sessionId": session_id})
    try:
        while True:
            payload = await ws.receive_json()
            try:
                await _drain_turn(ws, session_id, payload)
            except Exception as exc:  # un turno roto no cierra la conexión
                log.exception("turno falló")
                # El socket puede haber muerto a medio turno (proxy, red);
                # si el aviso de error también falla, no vuelvas a tronar.
                with suppress(Exception):
                    await ws.send_json({"type": "error", "message": str(exc)})
    except WebSocketDisconnect:
        log.info("sesión %s desconectada", session_id)


class TurnRequest(BaseModel):
    session_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    type: str = "user_message"
    text: str = ""
    name: str | None = None
    params: dict = Field(default_factory=dict)
    dataModel: dict = Field(default_factory=dict)


@app.post("/v1/turn")
async def turn_sse(req: TurnRequest) -> StreamingResponse:
    async def stream():
        # Mismo patrón que _drain_turn: asyncio.wait (no wait_for) sobre una
        # Task persistente — wait_for CANCELARÍA __anext__() al pasar el
        # timeout, matando el generador en silencio (ver notes/APRENDIZAJES_HARNESS.md).
        agen = run_turn(req.session_id, req.model_dump()).__aiter__()
        while True:
            next_task = asyncio.ensure_future(agen.__anext__())
            while True:
                done, _pending = await asyncio.wait({next_task}, timeout=HEARTBEAT_S)
                if next_task in done:
                    break
                yield 'data: {"type": "heartbeat"}\n\n'  # no morir por idle timeout del proxy
            try:
                event = next_task.result()
            except StopAsyncIteration:
                break
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.delete("/v1/session/{session_id}")
async def reset(session_id: str) -> dict:
    await app.state.store.drop(session_id)
    return {"status": "deleted", "session_id": session_id}


# ── frontend estático (se monta al final: las rutas de arriba tienen prioridad) ──
from pathlib import Path as _Path  # noqa: E402
from fastapi.staticfiles import StaticFiles as _StaticFiles  # noqa: E402

_STATIC_DIR = _Path(__file__).resolve().parents[2] / "static"
if (_STATIC_DIR / "index.html").exists():
    app.mount("/", _StaticFiles(directory=_STATIC_DIR, html=True), name="web")
else:
    log.info("sin build de frontend en %s — solo API", _STATIC_DIR)
