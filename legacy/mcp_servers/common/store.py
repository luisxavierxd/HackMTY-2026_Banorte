"""Almacén sintético compartido por los servidores MCP.

Persistencia en un JSON local: las acciones (aplicar un plan, mover dinero)
cambian estado DE VERDAD y el cambio sobrevive al siguiente turno. Eso es lo
que pide la regla 3 del reto: "una interacción que produzca un cambio real".
Cambiar esto por Postgres es reemplazar dos funciones.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

DB_PATH = Path(os.environ.get("GENUI_DB", Path(__file__).resolve().parents[2] / "data" / "state.json"))
_LOCK = threading.Lock()

SEED: dict[str, Any] = {
    "cliente": {
        "id": "CU-40218",
        "nombre": "Ana Ramírez",
        "segmento": "nomina",
        "score_interno": 712,
        "ingreso_mensual": 28500.0,
        "antiguedad_meses": 41,
    },
    "cuentas": [
        {"id": "AC-001", "tipo": "nomina", "alias": "Cuenta de nómina", "saldo": 21430.55},
        {"id": "AC-002", "tipo": "ahorro", "alias": "Ahorro Meta", "saldo": 58200.00},
    ],
    "tarjetas": [
        {
            "id": "TC-771",
            "alias": "Tarjeta Clásica",
            "saldo": 18400.00,
            "limite": 45000.00,
            "tasa_anual": 0.389,
            "pago_minimo": 1840.00,
            "fecha_corte": "2026-09-28",
        }
    ],
    "movimientos": [
        {"fecha": "2026-09-08", "concepto": "Supermercado", "categoria": "despensa", "monto": -1840.20},
        {"fecha": "2026-09-07", "concepto": "Gasolina", "categoria": "transporte", "monto": -900.00},
        {"fecha": "2026-09-05", "concepto": "Suscripciones", "categoria": "servicios", "monto": -449.00},
        {"fecha": "2026-09-04", "concepto": "Restaurante", "categoria": "comida fuera", "monto": -1210.50},
        {"fecha": "2026-09-01", "concepto": "Depósito de nómina", "categoria": "ingreso", "monto": 28500.00},
        {"fecha": "2026-08-28", "concepto": "Pago tarjeta TC-771", "categoria": "credito", "monto": -1840.00},
        {"fecha": "2026-08-26", "concepto": "Farmacia", "categoria": "salud", "monto": -620.90},
        {"fecha": "2026-08-22", "concepto": "Renta", "categoria": "vivienda", "monto": -9500.00},
    ],
    "planes_aplicados": [],
    "eventos": [],
}


def _read() -> dict:
    if not DB_PATH.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        DB_PATH.write_text(json.dumps(SEED, indent=2, ensure_ascii=False), encoding="utf-8")
        return json.loads(json.dumps(SEED))
    return json.loads(DB_PATH.read_text(encoding="utf-8"))


def read() -> dict:
    with _LOCK:
        return _read()


def mutate(fn) -> dict:
    """Aplica fn(state) -> resultado y persiste. Único punto de escritura."""
    with _LOCK:
        state = _read()
        result = fn(state)
        DB_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
        return result


def reset() -> None:
    with _LOCK:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        DB_PATH.write_text(json.dumps(SEED, indent=2, ensure_ascii=False), encoding="utf-8")
