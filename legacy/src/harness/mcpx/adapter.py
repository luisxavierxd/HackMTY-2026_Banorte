"""Puente MCP -> Gemini.

Gemini acepta un subconjunto de OpenAPI 3.0, no JSON Schema completo. Los
esquemas que genera el SDK de MCP (via pydantic) traen `$defs`, `anyOf`, `title`,
`additionalProperties`, `exclusiveMinimum`… y la API responde 400 si se pasan
tal cual. Este módulo los normaliza. Es código aburrido y es exactamente el
que evita que la demo falle en vivo.
"""

from __future__ import annotations

from typing import Any

_ALLOWED = {
    "type", "format", "description", "nullable", "enum",
    "properties", "required", "items", "minimum", "maximum",
}
_TYPE_MAP = {
    "string": "STRING", "number": "NUMBER", "integer": "INTEGER",
    "boolean": "BOOLEAN", "array": "ARRAY", "object": "OBJECT",
}


def _resolve_ref(node: dict, defs: dict) -> dict:
    ref = node.get("$ref", "")
    key = ref.split("/")[-1]
    return dict(defs.get(key, {})) if key in defs else {}


def sanitize_schema(node: Any, defs: dict | None = None) -> dict:
    if not isinstance(node, dict):
        return {"type": "STRING"}
    defs = defs or node.get("$defs") or node.get("definitions") or {}

    if "$ref" in node:
        node = {**_resolve_ref(node, defs), **{k: v for k, v in node.items() if k != "$ref"}}

    # anyOf/oneOf: tomamos la primera rama no-null (patrón Optional[X] de pydantic)
    for key in ("anyOf", "oneOf", "allOf"):
        if key in node:
            branches = [b for b in node[key] if b.get("type") != "null"]
            merged = sanitize_schema(branches[0], defs) if branches else {"type": "STRING"}
            if node.get("description"):
                merged["description"] = node["description"]
            merged["nullable"] = len(branches) != len(node[key])
            return merged

    out: dict[str, Any] = {}
    for key, value in node.items():
        if key not in _ALLOWED:
            continue
        if key == "type":
            t = value[0] if isinstance(value, list) else value
            out["type"] = _TYPE_MAP.get(t, "STRING")
        elif key == "properties":
            out["properties"] = {k: sanitize_schema(v, defs) for k, v in value.items()}
        elif key == "items":
            out["items"] = sanitize_schema(value, defs)
        else:
            out[key] = value

    if out.get("type") == "OBJECT" and not out.get("properties"):
        # Gemini rechaza OBJECT sin properties.
        out["properties"] = {"value": {"type": "STRING"}}
    out.setdefault("type", "OBJECT" if "properties" in out else "STRING")
    return out


def tool_to_declaration(tool) -> dict:
    """ToolRef -> dict con forma de types.FunctionDeclaration."""
    schema = sanitize_schema(tool.input_schema)
    if schema.get("type") != "OBJECT":
        schema = {"type": "OBJECT", "properties": {}}
    return {
        "name": tool.qualified,
        "description": tool.description[:1024],
        "parameters": schema,
    }
