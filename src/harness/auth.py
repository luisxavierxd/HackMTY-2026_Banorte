"""Código de acceso a nivel de app — protege la cuota del CLI/API en una
demo pública de hackatón, SIN depender de HTTP Basic Auth.

Por qué no Basic Auth (se probó primero, se descartó a propósito): el popup
nativo del navegador para `WWW-Authenticate: Basic` no es confiable dentro
de un WebView de una app móvil — muchos ni lo muestran, o hace falta
código nativo extra (`onReceivedHttpAuthRequest` en Android, etc.) que no
existe en un WebView genérico. Como este frontend se piensa portar a móvil,
la protección tiene que vivir DENTRO de la propia app (React), no en un
mecanismo del navegador.

Diseño: un solo código compartido (`APP_KEY`, no usuario+contraseña — es un
gate de acceso a la demo, no un sistema de cuentas). Se manda:
  - por query string (`?key=...`) en el WebSocket — el WebSocket del
    navegador NO permite headers custom en el handshake, así que query
    string es la única forma estándar de mandarlo ahí.
  - por header `X-App-Key` en las llamadas HTTP que sí importan proteger
    (`/v1/turn`, `DELETE /v1/session/{id}`) — esas sí soportan headers
    custom vía fetch.

A propósito NO se protegen los estáticos (index.html/JS/CSS no tienen nada
sensible, es solo código de UI) ni /healthz, /readyz, /a2ui/catalog.json,
/a2ui/tools (metadata, no cuestan cuota) — solo lo que de verdad dispara al
CLI/API o muta estado de sesión.
"""

from __future__ import annotations

import secrets
from urllib.parse import parse_qs

from starlette.types import ASGIApp, Receive, Scope, Send

#: paths HTTP que si cuestan cuota/mutan estado — todo lo demás queda público.
_PROTECTED_HTTP_PREFIXES = ("/v1/turn", "/v1/session")


def _header(scope: Scope, name: bytes) -> bytes:
    for key, value in scope.get("headers") or []:
        if key.lower() == name:
            return value
    return b""


def _query_param(scope: Scope, name: str) -> str:
    qs = parse_qs((scope.get("query_string") or b"").decode())
    values = qs.get(name)
    return values[0] if values else ""


class AccessKeyMiddleware:
    """ASGI puro (no `BaseHTTPMiddleware`): así también cubre el scope
    `websocket`, que `BaseHTTPMiddleware` de Starlette ignora por completo.

    Sin `key` configurada (default en dev local), es un no-op total.
    """

    def __init__(self, app: ASGIApp, key: str) -> None:
        self.app = app
        self.key = key
        self.enabled = bool(key)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self.enabled or scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        if scope["type"] == "websocket":
            sent = _query_param(scope, "key")
            if secrets.compare_digest(sent, self.key):
                await self.app(scope, receive, send)
                return
            # El navegador oculta el código HTTP de un handshake rechazado
            # (siempre reporta 1006 al JS si se cierra ANTES de aceptar) —
            # hay que aceptar primero para que el código 4401 real llegue al
            # frontend y pueda distinguir "key mala" de "sin red".
            await send({"type": "websocket.accept"})
            await send({"type": "websocket.close", "code": 4401})
            return

        path = scope.get("path", "")
        if not path.startswith(_PROTECTED_HTTP_PREFIXES):
            await self.app(scope, receive, send)
            return

        sent = _header(scope, b"x-app-key").decode(errors="replace") or _query_param(scope, "key")
        if secrets.compare_digest(sent, self.key):
            await self.app(scope, receive, send)
            return

        await send(
            {
                "type": "http.response.start",
                "status": 401,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": b'{"error":"codigo de acceso invalido"}'})
