#!/usr/bin/env python3
"""Genera fixtures de superficies A2UI con datos reales de las tools MCP.

Importa las tools directamente (sin LLM, sin red) y construye eventos
`surface` completos para cada una. Los fixtures sirven para desarrollar
el frontend sin backend corriendo (/?lab=1).

Uso:
    python scripts/dump_fixtures.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mcp_servers"))

from common import store  # noqa: E402

# Asegurar que el estado sintético existe
store.reset()

from educacion_financiera.server import (  # noqa: E402
    comparar_pago_minimo_vs_fijo,
    explicar_cat,
    explicar_interes_compuesto,
    regla_50_30_20,
    simular_meta_ahorro,
    visualizar_inflacion,
)

OUT = ROOT / "frontend" / "src" / "lab" / "fixtures"
OUT.mkdir(parents=True, exist_ok=True)


def _surface(tool_name: str, data: dict, title: str, summary: str, components: list) -> dict:
    """Construye un evento surface completo con envelopes A2UI."""
    return {
        "type": "surface",
        "title": title,
        "summary": summary,
        "a2ui": [
            {"createSurface": {"surfaceId": "main", "catalogId": "fin-catalog"}},
            {"updateDataModel": {"surfaceId": "main", "path": "/", "value": {"datos": {tool_name: data}}}},
            {"updateComponents": {"surfaceId": "main", "components": components}},
        ],
        "warnings": [],
    }


# ── 1. Interés compuesto ──────────────────────────────────────────────
ic = explicar_interes_compuesto(capital=10000, tasa_anual=0.30, meses=24)
fixtures = {
    "interes_compuesto": _surface(
        "explicar_interes_compuesto", ic,
        "Tu deuda con interés compuesto",
        ic["explicacion"],
        [
            {"id": "root", "component": "Column", "props": {"children": ["metric", "chart", "opts"], "gap": "md"}},
            {"id": "metric", "component": "MetricCard", "props": {
                "label": "Saldo final en 24 meses", "value": f"${ic['resumen']['saldo_final']:,.0f}",
                "delta": f"+{ic['resumen']['factor_crecimiento']:.0%}", "tone": "danger",
            }},
            {"id": "chart", "component": "LineChart", "props": {
                "title": "Crecimiento de la deuda",
                "series": [
                    {"label": "Saldo", "path": "/datos/explicar_interes_compuesto/serie", "key": "saldo", "tone": "costo", "emphasis": True},
                    {"label": "Interés acumulado", "path": "/datos/explicar_interes_compuesto/serie", "key": "interes_acumulado", "tone": "neutral"},
                ],
                "xKey": "mes", "xLabel": "meses", "format": "currency",
            }},
            {"id": "opts", "component": "ActionButton", "props": {
                "text": "Ver opciones de pago",
                "action": {"event": {"name": "ver_opciones_pago", "params": {}}},
            }},
        ],
    ),
}

# ── 2. Pago mínimo vs fijo ───────────────────────────────────────────
pm = comparar_pago_minimo_vs_fijo()
fixtures["pago_minimo_vs_fijo"] = _surface(
    "comparar_pago_minimo_vs_fijo", pm,
    "Pago mínimo vs pago fijo",
    pm["explicacion"],
    [
        {"id": "root", "component": "Column", "props": {"children": ["row", "chart", "btn"], "gap": "md"}},
        {"id": "row", "component": "Row", "props": {"children": ["m1", "m2"], "align": "between"}},
        {"id": "m1", "component": "MetricCard", "props": {
            "label": "Pagando mínimo", "value": f"{pm['escenarios']['pago_minimo']['meses_para_liquidar']} meses",
            "tone": "danger",
        }},
        {"id": "m2", "component": "MetricCard", "props": {
            "label": "Pagando fijo", "value": f"{pm['escenarios']['pago_fijo']['meses_para_liquidar']} meses",
            "tone": "success",
        }},
        {"id": "chart", "component": "LineChart", "props": {
            "title": "Saldo de tu deuda",
            "series": [
                {"label": "Pago mínimo", "path": "/datos/comparar_pago_minimo_vs_fijo/escenarios/pago_minimo/serie", "key": "saldo", "tone": "costo", "emphasis": True},
                {"label": f"Pago fijo ${pm['escenarios']['pago_fijo']['pago_mensual']:,.0f}", "path": "/datos/comparar_pago_minimo_vs_fijo/escenarios/pago_fijo/serie", "key": "saldo", "tone": "ahorro"},
            ],
            "xKey": "mes", "xLabel": "meses", "format": "currency",
        }},
        {"id": "btn", "component": "ActionButton", "props": {
            "text": "Aplicar pago fijo",
            "action": {"event": {"name": "aplicar_plan_pago", "params": {"tipo": "fijo"}}},
        }},
    ],
)

# ── 3. Meta de ahorro ────────────────────────────────────────────────
ma = simular_meta_ahorro(meta=50000, plazo_meses=12)
fixtures["meta_ahorro"] = _surface(
    "simular_meta_ahorro", ma,
    "Tu meta de ahorro",
    ma["explicacion"],
    [
        {"id": "root", "component": "Column", "props": {"children": ["ring", "chart", "slider", "btn"], "gap": "md"}},
        {"id": "ring", "component": "ProgressRing", "props": {
            "label": "Meta de ahorro",
            "value": 0, "target": 50000,
            "caption": f"Aportación mensual: ${ma['escenarios']['con_rendimiento']['aporte_mensual']:,.0f}",
            "tone": "ahorro",
        }},
        {"id": "chart", "component": "LineChart", "props": {
            "title": "Progreso del ahorro",
            "series": [
                {"label": "Con rendimiento", "path": "/datos/simular_meta_ahorro/escenarios/con_rendimiento/serie", "key": "acumulado", "tone": "ahorro", "emphasis": True},
                {"label": "Sin rendimiento", "path": "/datos/simular_meta_ahorro/escenarios/sin_rendimiento/serie", "key": "acumulado", "tone": "neutral"},
            ],
            "xKey": "mes", "xLabel": "meses", "format": "currency",
        }},
        {"id": "slider", "component": "Slider", "props": {
            "label": "Plazo", "min": 6, "max": 36, "step": 6,
            "value": 12, "format": "number",
        }},
        {"id": "btn", "component": "ActionButton", "props": {
            "text": "Empezar a ahorrar",
            "action": {"event": {"name": "crear_meta_ahorro", "params": {"plazo": 12}}},
        }},
    ],
)

# ── 4. CAT ────────────────────────────────────────────────────────────
cat = explicar_cat()
fixtures["cat"] = _surface(
    "explicar_cat", cat,
    "¿Qué es el CAT?",
    cat["explicacion"],
    [
        {"id": "root", "component": "Column", "props": {"children": ["row", "chart", "nota", "table", "btn"], "gap": "md"}},
        {"id": "row", "component": "Row", "props": {"children": ["m1", "m2"], "align": "between"}},
        {"id": "m1", "component": "MetricCard", "props": {
            "label": "Tasa anual", "value": f"{cat['resumen']['tasa_anual']:.1%}", "tone": "neutral",
        }},
        {"id": "m2", "component": "MetricCard", "props": {
            "label": "CAT", "value": f"{cat['resumen']['cat_aproximado']:.1%}", "tone": "danger",
        }},
        {"id": "chart", "component": "PieChart", "props": {
            "title": "Desglose del costo total",
            "slices": [
                {"label": "Capital", "value": cat["desglose_costo"]["capital"]},
                {"label": "Intereses", "value": cat["desglose_costo"]["intereses"]},
                {"label": "Comisión", "value": cat["desglose_costo"]["comision_apertura"]},
                {"label": "Seguros", "value": cat["desglose_costo"]["seguros"]},
            ],
            "format": "currency",
        }},
        {"id": "nota", "component": "Callout", "props": {
            "text": "El CAT es una aproximación por TIR, no la metodología exacta de Banxico.",
            "tone": "neutral",
        }},
        {"id": "table", "component": "DataTable", "props": {
            "columns": [
                {"key": "mes", "label": "Mes"},
                {"key": "pago_total", "label": "Pago", "format": "currency"},
                {"key": "interes", "label": "Interés", "format": "currency"},
                {"key": "capital", "label": "Capital", "format": "currency"},
                {"key": "saldo", "label": "Saldo", "format": "currency"},
            ],
            "rows": {"path": "/datos/explicar_cat/serie"},
            "maxRows": 6,
        }},
        {"id": "btn", "component": "ActionButton", "props": {
            "text": "Comparar otro crédito",
            "action": {"event": {"name": "comparar_credito", "params": {}}},
            "variant": "secondary",
        }},
    ],
)

# ── 5. Inflación ─────────────────────────────────────────────────────
inf = visualizar_inflacion(monto=10000, anios=5)
fixtures["inflacion"] = _surface(
    "visualizar_inflacion", inf,
    "Inflación y tu dinero",
    inf["explicacion"],
    [
        {"id": "root", "component": "Column", "props": {"children": ["metric", "chart", "btn"], "gap": "md"}},
        {"id": "metric", "component": "MetricCard", "props": {
            "label": "Poder de compra en 5 años",
            "value": f"${inf['resumen']['poder_compra_final']:,.0f}",
            "delta": f"-${inf['resumen']['perdida_total']:,.0f}",
            "tone": "danger",
        }},
        {"id": "chart", "component": "LineChart", "props": {
            "title": "Poder de compra real",
            "series": [
                {"label": "Poder de compra", "path": "/datos/visualizar_inflacion/serie", "key": "poder_compra_real", "tone": "costo", "emphasis": True},
            ],
            "xKey": "anio", "xLabel": "años", "format": "currency",
        }},
        {"id": "btn", "component": "ActionButton", "props": {
            "text": "Ver opciones de inversión",
            "action": {"event": {"name": "ver_inversiones", "params": {}}},
        }},
    ],
)

# ── 6. Regla 50/30/20 ────────────────────────────────────────────────
r = regla_50_30_20()
fixtures["regla_50_30_20"] = _surface(
    "regla_50_30_20", r,
    "Tu presupuesto 50/30/20",
    r["explicacion"],
    [
        {"id": "root", "component": "Column", "props": {"children": ["metric", "chart", "list"], "gap": "md"}},
        {"id": "metric", "component": "MetricCard", "props": {
            "label": "Ahorro mensual actual",
            "value": f"${r['resumen']['ahorro_real']:,.0f}",
            "delta": f"{r['resumen']['ahorro_como_porcentaje']:.0f}% de tu ingreso",
            "tone": "success" if r["resumen"]["ahorro_como_porcentaje"] >= 20 else "warning",
        }},
        {"id": "chart", "component": "ComparisonBars", "props": {
            "title": "Ideal vs tu gasto real",
            "labelA": "Ideal",
            "labelB": "Real",
            "categories": [
                {"label": c["grupo"].replace("_", " ").title(), "a": c["ideal"], "b": c["real"]}
                for c in r["comparacion"]
            ],
            "toneB": "costo",
            "format": "currency",
        }},
        {"id": "list", "component": "OptionList", "props": {
            "options": [
                {"id": c["grupo"], "label": c["grupo"].replace("_", " ").title(),
                 "caption": f"{'Excedido' if c['status'] != 'ok' else 'En rango'}: ${abs(c['diferencia']):,.0f}",
                 "highlight": c["status"] != "ok"}
                for c in r["comparacion"]
            ],
            "value": {"path": "/selected_grupo"},
            "action": {"event": {"name": "ver_detalle_grupo", "params": {}}},
        }},
    ],
)

# ── Escribir fixtures ─────────────────────────────────────────────────
for name, fixture in fixtures.items():
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  OK {path.relative_to(ROOT)}")

print(f"\n{len(fixtures)} fixtures generadas en {OUT.relative_to(ROOT)}/")
