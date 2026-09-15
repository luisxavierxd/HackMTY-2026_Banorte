#!/usr/bin/env python3
"""Genera los goldens de las 6 tools: entrada -> salida, calculadas por el Python.

Es la mitad del anti-drift del §3 de la spec. La otra mitad es el test de
vitest que corre cada golden contra la implementación TS (`web/tests/`).
Sin estos dos, las dos implementaciones del dominio se desincronizan en
semanas y el split deja de ser defendible.

Los casos incluyen bordes a propósito: cero, negativos, plazos largos y tasas
absurdas. Ahí es donde el redondeo y las divisiones se separan entre Python y
JS, que es justo lo que queremos que el test atrape.

    python scripts/export_tool_goldens.py            # escribe
    python scripts/export_tool_goldens.py --check    # falla si hay drift (CI)
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EDU_DIR = ROOT / "legacy" / "mcp_servers"
OUT_DIR = ROOT / "web" / "tests" / "goldens"

# El servidor MCP se importa como módulo suelto (igual que hace su propio
# test en legacy/tests/test_domain_educacion.py): las tools son funciones
# puras, no hace falta levantar el transporte para calcular una salida.
sys.path.insert(0, str(EDU_DIR))
_spec = importlib.util.spec_from_file_location(
    "edu_server", EDU_DIR / "educacion_financiera" / "server.py"
)
assert _spec and _spec.loader
edu = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(edu)


#: entradas representativas por tool. La clave es el nombre corto.
CASES: dict[str, list[dict[str, Any]]] = {
    "explicar_interes_compuesto": [
        {},                                                        # defaults
        {"capital": 10000, "tasa_anual": 0.30, "meses": 12},
        {"capital": 10000, "tasa_anual": 0.0, "meses": 6},         # tasa cero
        {"capital": 1, "tasa_anual": 0.99, "meses": 60},           # plazo largo
        {"capital": 250000, "tasa_anual": 2.5, "meses": 36},       # tasa absurda
        # OJO: capital=0 NO es un caso válido — el Python revienta con
        # ZeroDivisionError en `factor_crecimiento: round(saldo / capital, 4)`.
        # Es un bug del harness congelado; no se replica ni se parchea aquí.
    ],
    "comparar_pago_minimo_vs_fijo": [
        {},                                                        # 2x el mínimo
        {"pago_fijo": 5000.0},
        {"pago_fijo": 1840.01},                                    # apenas sobre el mínimo
        {"pago_fijo": 18400.0},                                    # liquida casi de golpe
    ],
    "simular_meta_ahorro": [
        {},
        {"meta": 50000, "plazo_meses": 12, "tasa_ahorro_anual": 0.08},
        {"meta": 12000, "plazo_meses": 12, "tasa_ahorro_anual": 0.0},   # sin rendimiento
        {"meta": 1000000, "plazo_meses": 240, "tasa_ahorro_anual": 0.12},  # 20 años
        {"meta": 100, "plazo_meses": 1, "tasa_ahorro_anual": 0.5},
    ],
    "explicar_cat": [
        {},
        {"monto": 100000, "plazo_meses": 12, "tasa_anual": 0.289,
         "comision_apertura": 0.01, "seguro_mensual": 150.0},
        {"monto": 100000, "plazo_meses": 12, "tasa_anual": 0.20,
         "comision_apertura": 0.0, "seguro_mensual": 0.0},         # CAT ≈ tasa
        {"monto": 50000, "plazo_meses": 60, "tasa_anual": 0.45,
         "comision_apertura": 0.05, "seguro_mensual": 400.0},      # plazo largo
        {"monto": 100000, "plazo_meses": 24, "tasa_anual": 0.0,
         "comision_apertura": 0.0, "seguro_mensual": 0.0},         # tasa cero
    ],
    "visualizar_inflacion": [
        {},
        {"monto": 10000, "anios": 5, "inflacion_anual": 0.05},
        {"monto": 10000, "anios": 3, "inflacion_anual": 0.10},
        {"monto": 10000, "anios": 30, "inflacion_anual": 0.045},   # horizonte largo
        {"monto": 10000, "anios": 5, "inflacion_anual": 0.0},      # sin inflación
    ],
    "regla_50_30_20": [
        {},                                                        # ingreso del perfil
        {"ingreso_mensual": 100000.0},
        {"ingreso_mensual": 1.0},                                  # ingreso mínimo
        {"ingreso_mensual": 28500.0},
    ],
}


def _dump(doc: Any) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="no escribe; sale 1 si lo generado difiere de lo commiteado")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    drift: list[str] = []

    for tool_name, cases in CASES.items():
        fn = getattr(edu, tool_name, None)
        if fn is None:
            print(f"la tool '{tool_name}' no existe en el servidor MCP", file=sys.stderr)
            return 1
        # Las @mcp.tool() envuelven la función; `.fn` es la original si el
        # decorador la guardó, si no el objeto ya es llamable.
        raw = getattr(fn, "fn", fn)
        golden = {
            "tool": tool_name,
            "cases": [{"args": a, "expected": raw(**a)} for a in cases],
        }
        path = OUT_DIR / f"{tool_name}.json"
        payload = _dump(golden)
        if args.check:
            current = path.read_text(encoding="utf-8") if path.exists() else ""
            if current != payload:
                drift.append(path.name)
        else:
            path.write_text(payload, encoding="utf-8")
            print(f"escrito {path.relative_to(ROOT)} ({len(cases)} casos)")

    if drift:
        print(
            "DRIFT en los goldens: " + ", ".join(drift) + "\n"
            "corre `make contract` y commitea.",
            file=sys.stderr,
        )
        return 1
    if args.check:
        print("goldens sin drift")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
