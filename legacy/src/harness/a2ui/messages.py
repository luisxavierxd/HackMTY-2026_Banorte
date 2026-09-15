"""Envelopes A2UI v0.9.1 (server -> client) y el mensaje `action` (client -> server).

Referencia: https://a2ui.org/reference/messages/  (v0.9.1)
Solo emitimos el subconjunto que el reto necesita:
    createSurface | updateComponents | updateDataModel | deleteSurface
"""

from __future__ import annotations

from typing import Any

from .catalog import CATALOG_ID

A2UI_VERSION = "v0.9.1"
A2UI_MIME_TYPE = "application/a2ui+json"


def create_surface(surface_id: str, theme: dict | None = None, send_data_model: bool = True) -> dict:
    msg: dict[str, Any] = {
        "surfaceId": surface_id,
        "catalogId": CATALOG_ID,
        "sendDataModel": send_data_model,
    }
    if theme:
        msg["theme"] = theme
    return {"version": A2UI_VERSION, "createSurface": msg}


def update_components(surface_id: str, components: list[dict]) -> dict:
    return {
        "version": A2UI_VERSION,
        "updateComponents": {"surfaceId": surface_id, "components": components},
    }


def update_data_model(surface_id: str, path: str, value: Any) -> dict:
    return {
        "version": A2UI_VERSION,
        "updateDataModel": {"surfaceId": surface_id, "path": path, "value": value},
    }


def delete_surface(surface_id: str) -> dict:
    return {"version": A2UI_VERSION, "deleteSurface": {"surfaceId": surface_id}}


# --------------------------------------------------------------------------- #
# JSON Pointer (RFC 6901) mínimo: evita una dependencia extra.
# --------------------------------------------------------------------------- #
def pointer_get(doc: Any, pointer: str, default: Any = None) -> Any:
    if pointer in ("", "/"):
        return doc
    cur = doc
    for raw in pointer.lstrip("/").split("/"):
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(cur, dict) and token in cur:
            cur = cur[token]
        elif isinstance(cur, list) and token.isdigit() and int(token) < len(cur):
            cur = cur[int(token)]
        else:
            return default
    return cur


def pointer_set(doc: dict, pointer: str, value: Any) -> dict:
    if pointer in ("", "/"):
        if isinstance(value, dict):
            doc.clear()
            doc.update(value)
        return doc
    tokens = [t.replace("~1", "/").replace("~0", "~") for t in pointer.lstrip("/").split("/")]
    cur: Any = doc
    for token in tokens[:-1]:
        if isinstance(cur, dict):
            cur = cur.setdefault(token, {})
        elif isinstance(cur, list) and token.isdigit():
            cur = cur[int(token)]
    last = tokens[-1]
    if isinstance(cur, list) and last.isdigit():
        cur[int(last)] = value
    elif isinstance(cur, dict):
        cur[last] = value
    return doc
