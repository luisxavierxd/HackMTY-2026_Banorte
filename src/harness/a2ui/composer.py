"""Composer: convierte el *plan de UI* que emite el LLM en envelopes A2UI válidos.

Decisión de arquitectura (ver documentacion/adr/0002):
el modelo NO emite protocolo crudo. Emite un plan compacto; Python lo valida
contra el catálogo, resuelve bindings y lo traduce a A2UI v0.9.1. Así:
  - una alucinación de componente nunca rompe el render (se poda + se repara),
  - el protocolo puede migrar (v0.9.1 -> v1.0) sin tocar el prompt,
  - el composer es determinista y testeable sin llamar al modelo.

Plan esperado (JSON):
{
  "title": "Reestructura tu saldo",
  "summary": "una línea de texto para el chat",
  "root": "root",
  "data": {"plan": {"selected": "12m"}},
  "components": [
     {"id": "root", "component": "Column", "props": {"children": ["kpi", "opts"]}},
     ...
  ]
}
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .catalog import COMPONENTS
from .messages import create_surface, update_components, update_data_model


@dataclass
class CompileResult:
    ok: bool
    messages: list[dict] = field(default_factory=list)
    components: list[dict] = field(default_factory=list)
    data: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)


def _is_binding(value: Any) -> bool:
    return isinstance(value, dict) and set(value.keys()) <= {"path"} and "path" in value


def _coerce_prop(comp: str, cid: str, pname: str, spec: dict, value: Any, errors: list[str]) -> Any:
    t = spec["type"]
    if t == "binding":
        if _is_binding(value):
            return value
        return value  # literal: string/number/bool también es válido
    if t == "enum":
        if value in spec["values"]:
            return value
        errors.append(f"{cid}({comp}).{pname}='{value}' no está en {spec['values']}")
        return spec.get("default", spec["values"][0])
    if t == "number":
        try:
            return float(value) if isinstance(value, str) else value
        except (TypeError, ValueError):
            errors.append(f"{cid}({comp}).{pname} debe ser número")
            return spec.get("default", 0)
    if t == "string":
        return value if isinstance(value, str) else str(value)
    if t == "boolean":
        return bool(value)
    if t in ("componentId", "componentIds", "objectList", "action"):
        return value
    return value


def validate_components(raw: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    """Valida contra el catálogo. Devuelve (componentes_ok, errores, ids_descartados)."""
    errors: list[str] = []
    dropped: list[str] = []
    by_id: dict[str, dict] = {}

    for item in raw or []:
        if not isinstance(item, dict):
            errors.append("componente que no es objeto")
            continue
        cid = item.get("id")
        comp = item.get("component")
        props = item.get("props") or {k: v for k, v in item.items() if k not in ("id", "component")}
        if not cid or not comp:
            errors.append(f"componente sin id/component: {str(item)[:80]}")
            continue
        if comp not in COMPONENTS:
            errors.append(f"'{comp}' no existe en el catálogo (id={cid})")
            dropped.append(cid)
            continue
        spec = COMPONENTS[comp]["props"]
        clean: dict[str, Any] = {}
        for pname, pspec in spec.items():
            if pname in props and props[pname] is not None:
                clean[pname] = _coerce_prop(comp, cid, pname, pspec, props[pname], errors)
            elif "default" in pspec:
                clean[pname] = pspec["default"]
            elif pspec.get("required"):
                errors.append(f"{cid}({comp}) falta prop requerida '{pname}'")
        for extra in set(props) - set(spec):
            errors.append(f"{cid}({comp}) prop desconocida '{extra}' (ignorada)")
        by_id[cid] = {"id": cid, "component": comp, **clean}

    # Poda de referencias rotas: children/child que apuntan a ids inexistentes.
    for cid, node in list(by_id.items()):
        for key in ("children", "child"):
            if key not in node:
                continue
            if key == "children" and isinstance(node[key], list):
                alive = [c for c in node[key] if c in by_id]
                if len(alive) != len(node[key]):
                    errors.append(f"{cid}: referencias rotas podadas en children")
                node[key] = alive
            elif key == "child" and node[key] not in by_id:
                errors.append(f"{cid}: child '{node[key]}' no existe")
                node.pop(key)
                dropped.append(cid)
                by_id.pop(cid, None)

    return list(by_id.values()), errors, dropped


def compile_plan(plan: dict, surface_id: str, first_render: bool) -> CompileResult:
    components, errors, dropped = validate_components(plan.get("components", []))
    ids = {c["id"] for c in components}
    root = plan.get("root") or (components[0]["id"] if components else None)

    if not components or root not in ids:
        errors.append("plan sin root renderizable")
        return CompileResult(ok=False, errors=errors, dropped=dropped)

    # A2UI v0.9: el root es el primer componente de la lista.
    components.sort(key=lambda c: 0 if c["id"] == root else 1)

    msgs: list[dict] = []
    if first_render:
        msgs.append(create_surface(surface_id))
    data = plan.get("data") or {}
    if isinstance(data, dict) and data:
        msgs.append(update_data_model(surface_id, "/", data))
    msgs.append(update_components(surface_id, components))

    return CompileResult(True, msgs, components, data if isinstance(data, dict) else {}, errors, dropped)


def fallback_plan(title: str, body: str, retry_action: str = "reintentar") -> dict:
    """Superficie mínima garantizada: la demo nunca se queda en blanco."""
    return {
        "title": title,
        "summary": body,
        "root": "root",
        "data": {},
        "components": [
            {"id": "root", "component": "Column", "props": {"children": ["t", "b", "cta"], "gap": "md"}},
            {"id": "t", "component": "Text", "props": {"text": title, "variant": "h2"}},
            {"id": "b", "component": "Text", "props": {"text": body, "variant": "body"}},
            {
                "id": "cta",
                "component": "ActionButton",
                "props": {
                    "text": "Reintentar",
                    "variant": "secondary",
                    "action": {"event": {"name": retry_action, "params": {}}},
                },
            },
        ],
    }
