"""Código de acceso a nivel de app: protege /v1/turn y /v1/session (lo que
cuesta cuota) sin usar HTTP Basic Auth, que no porta bien a un WebView de
app móvil. Sin APP_KEY configurada, debe ser un no-op total."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from harness.auth import AccessKeyMiddleware


def _app_with_auth(key: str) -> FastAPI:
    app = FastAPI()

    @app.get("/a2ui/catalog.json")
    def catalog():
        return {"ok": True}

    @app.post("/v1/turn")
    def turn():
        return {"ok": True}

    @app.delete("/v1/session/abc")
    def session():
        return {"ok": True}

    app.add_middleware(AccessKeyMiddleware, key=key)
    return app


def test_sin_key_configurada_es_noop():
    app = _app_with_auth("")
    client = TestClient(app)
    resp = client.post("/v1/turn")
    assert resp.status_code == 200


def test_con_key_configurada_rechaza_sin_key():
    app = _app_with_auth("secreta")
    client = TestClient(app)
    resp = client.post("/v1/turn")
    assert resp.status_code == 401


def test_con_key_configurada_rechaza_key_incorrecta():
    app = _app_with_auth("secreta")
    client = TestClient(app)
    resp = client.post("/v1/turn", headers={"X-App-Key": "adivinando"})
    assert resp.status_code == 401


def test_con_key_configurada_acepta_header_correcto():
    app = _app_with_auth("secreta")
    client = TestClient(app)
    resp = client.post("/v1/turn", headers={"X-App-Key": "secreta"})
    assert resp.status_code == 200


def test_con_key_configurada_acepta_query_param():
    app = _app_with_auth("secreta")
    client = TestClient(app)
    resp = client.post("/v1/turn?key=secreta")
    assert resp.status_code == 200


def test_rutas_no_protegidas_quedan_publicas_aunque_haya_key():
    app = _app_with_auth("secreta")
    client = TestClient(app)
    resp = client.get("/a2ui/catalog.json")
    assert resp.status_code == 200


def test_delete_session_esta_protegido():
    app = _app_with_auth("secreta")
    client = TestClient(app)
    assert client.delete("/v1/session/abc").status_code == 401
    assert client.delete("/v1/session/abc", headers={"X-App-Key": "secreta"}).status_code == 200


from starlette.websockets import WebSocket as _WebSocket  # noqa: E402


def test_websocket_sin_key_es_rechazado():
    app = FastAPI()

    @app.websocket("/ws/{sid}")
    async def ws(websocket: _WebSocket, sid: str):
        await websocket.accept()
        await websocket.send_json({"ok": True})

    app.add_middleware(AccessKeyMiddleware, key="secreta")
    client = TestClient(app)
    try:
        with client.websocket_connect("/ws/x"):
            raise AssertionError("no debió conectar sin key")
    except Exception:
        pass


def test_websocket_con_key_en_query_conecta():
    app = FastAPI()

    @app.websocket("/ws/{sid}")
    async def ws(websocket: _WebSocket, sid: str):
        await websocket.accept()
        await websocket.send_json({"ok": True})

    app.add_middleware(AccessKeyMiddleware, key="secreta")
    client = TestClient(app)
    with client.websocket_connect("/ws/x?key=secreta") as ws:
        assert ws.receive_json() == {"ok": True}
