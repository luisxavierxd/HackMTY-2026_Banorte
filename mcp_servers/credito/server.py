#!/usr/bin/env python3
"""Servidor MCP — dominio CRÉDITO (precalificación, amortización, refinanciamiento).

Transporte: stdio por defecto; `--http` levanta streamable-http en :8081
para desplegarlo como contenedor independiente.

Nota de dominio: la fórmula de pago es la anualidad estándar y el CAT se
aproxima con la tasa efectiva anual del flujo (incluye comisión). Es una
aproximación didáctica, no la metodología regulatoria de Banxico — está
documentado a propósito para no vender como exacto lo que es sintético.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import store  # noqa: E402
from mcp.server.mcpserver import MCPServer  # noqa: E402

mcp = MCPServer("credito", version="1.0.0")

CATALOGO_PLANES = [
    {"plazo_meses": 12, "tasa_anual": 0.289, "comision_apertura": 0.00},
    {"plazo_meses": 18, "tasa_anual": 0.305, "comision_apertura": 0.01},
    {"plazo_meses": 24, "tasa_anual": 0.325, "comision_apertura": 0.01},
    {"plazo_meses": 36, "tasa_anual": 0.349, "comision_apertura": 0.015},
]


def _pago_mensual(principal: float, tasa_anual: float, meses: int) -> float:
    i = tasa_anual / 12
    if i == 0:
        return principal / meses
    return principal * i / (1 - (1 + i) ** -meses)


def _cat_aprox(principal: float, pago: float, meses: int, comision: float) -> float:
    """TIR mensual del flujo (neto de comisión) anualizada y compuesta."""
    neto = principal * (1 - comision)
    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2
        vp = sum(pago / (1 + mid) ** t for t in range(1, meses + 1))
        if vp > neto:
            lo = mid
        else:
            hi = mid
    return round((1 + (lo + hi) / 2) ** 12 - 1, 4)


@mcp.tool()
def obtener_perfil_credito() -> dict[str, Any]:
    """Perfil crediticio del cliente: score interno, ingreso, antigüedad y deuda vigente.

    Úsalo SIEMPRE antes de precalificar o de recomendar un plazo.
    """
    st = store.read()
    cliente = st["cliente"]
    tarjeta = st["tarjetas"][0]
    return {
        "cliente": cliente["nombre"],
        "score_interno": cliente["score_interno"],
        "ingreso_mensual": cliente["ingreso_mensual"],
        "antiguedad_meses": cliente["antiguedad_meses"],
        "deuda_revolvente": tarjeta["saldo"],
        "razon_deuda_ingreso": round(tarjeta["saldo"] / cliente["ingreso_mensual"], 2),
    }


@mcp.tool()
def obtener_saldo_tarjeta() -> dict[str, Any]:
    """Saldo, límite, tasa anual, pago mínimo y fecha de corte de la tarjeta."""
    t = store.read()["tarjetas"][0]
    interes_mensual = round(t["saldo"] * t["tasa_anual"] / 12, 2)
    return {
        **t,
        "interes_mensual_estimado": interes_mensual,
        "meses_pagando_minimo": _meses_pagando_minimo(t),
    }


def _meses_pagando_minimo(t: dict) -> int:
    saldo, i, meses = t["saldo"], t["tasa_anual"] / 12, 0
    while saldo > 0 and meses < 600:
        saldo = saldo * (1 + i) - t["pago_minimo"]
        meses += 1
    return meses


@mcp.tool()
def simular_reestructura(monto: float | None = None, plazos: list[int] | None = None) -> dict[str, Any]:
    """Simula planes de reestructura del saldo revolvente a pagos fijos.

    Args:
        monto: saldo a reestructurar. Si se omite, usa el saldo total de la tarjeta.
        plazos: plazos en meses a comparar. Si se omite, usa 12/18/24/36.

    Returns:
        Opciones con pago mensual, CAT aproximado, interés total y ahorro contra
        seguir pagando el mínimo.
    """
    st = store.read()
    tarjeta = st["tarjetas"][0]
    principal = float(monto or tarjeta["saldo"])
    elegidos = plazos or [p["plazo_meses"] for p in CATALOGO_PLANES]

    costo_minimo = tarjeta["pago_minimo"] * _meses_pagando_minimo(tarjeta)
    opciones = []
    for plan in CATALOGO_PLANES:
        if plan["plazo_meses"] not in elegidos:
            continue
        pago = _pago_mensual(principal, plan["tasa_anual"], plan["plazo_meses"])
        total = pago * plan["plazo_meses"]
        opciones.append(
            {
                "id": f"{plan['plazo_meses']}m",
                "plazo_meses": plan["plazo_meses"],
                "pago_mensual": round(pago, 2),
                "tasa_anual": plan["tasa_anual"],
                "cat_aproximado": _cat_aprox(
                    principal, pago, plan["plazo_meses"], plan["comision_apertura"]
                ),
                "interes_total": round(total - principal, 2),
                "costo_total": round(total, 2),
                "ahorro_vs_minimo": round(costo_minimo - total, 2),
            }
        )
    return {
        "monto_reestructurado": round(principal, 2),
        "escenario_actual": {
            "pago_minimo": tarjeta["pago_minimo"],
            "meses_pagando_minimo": _meses_pagando_minimo(tarjeta),
            "costo_total_minimo": round(costo_minimo, 2),
        },
        "opciones": opciones,
        "nota": "CAT aproximado con fines de simulación; datos sintéticos.",
    }


@mcp.tool()
def tabla_amortizacion(monto: float, plazo_meses: int, tasa_anual: float | None = None) -> dict[str, Any]:
    """Tabla de amortización mes a mes (capital, interés, saldo) de un plan.

    Args:
        monto: principal del crédito.
        plazo_meses: número de pagos.
        tasa_anual: tasa anual; si se omite, se toma la del catálogo para ese plazo.
    """
    if tasa_anual is None:
        match = next((p for p in CATALOGO_PLANES if p["plazo_meses"] == plazo_meses), None)
        tasa_anual = match["tasa_anual"] if match else 0.32
    pago = _pago_mensual(monto, tasa_anual, plazo_meses)
    saldo, filas, interes_total = monto, [], 0.0
    for mes in range(1, plazo_meses + 1):
        interes = saldo * tasa_anual / 12
        capital = pago - interes
        saldo = max(saldo - capital, 0.0)
        interes_total += interes
        filas.append(
            {
                "mes": mes,
                "pago": round(pago, 2),
                "interes": round(interes, 2),
                "capital": round(capital, 2),
                "saldo": round(saldo, 2),
            }
        )
    return {
        "pago_mensual": round(pago, 2),
        "interes_total": round(interes_total, 2),
        "filas": filas,
    }


@mcp.tool()
def aplicar_plan_reestructura(plan_id: str, monto: float, confirmado: bool = False) -> dict[str, Any]:
    """ACCIÓN REAL: contrata un plan de reestructura y modifica el estado de la cuenta.

    Args:
        plan_id: id de la opción devuelta por simular_reestructura (ej. "12m").
        monto: monto a reestructurar.
        confirmado: debe ser true. Solo se envía cuando la persona confirmó en la UI.
    """
    if not confirmado:
        return {
            "aplicado": False,
            "requiere_confirmacion": True,
            "mensaje": "Muestra un ActionButton con confirm antes de aplicar el plan.",
        }
    plazo = int(plan_id.rstrip("m"))
    plan = next((p for p in CATALOGO_PLANES if p["plazo_meses"] == plazo), None)
    if plan is None:
        return {"aplicado": False, "error": f"plan '{plan_id}' no existe"}

    pago = round(_pago_mensual(monto, plan["tasa_anual"], plazo), 2)
    folio = f"RE-{date.today():%y%m}-{plazo}{int(monto) % 997:03d}"

    def _apply(state: dict) -> dict:
        tarjeta = state["tarjetas"][0]
        tarjeta["saldo"] = round(max(tarjeta["saldo"] - monto, 0.0), 2)
        tarjeta["pago_minimo"] = round(tarjeta["saldo"] * 0.10, 2)
        registro = {
            "folio": folio,
            "plan_id": plan_id,
            "monto": round(monto, 2),
            "pago_mensual": pago,
            "tasa_anual": plan["tasa_anual"],
            "primer_pago": str(date.today() + timedelta(days=30)),
            "estado": "activo",
        }
        state["planes_aplicados"].append(registro)
        state["eventos"].append({"tipo": "reestructura_aplicada", "folio": folio})
        return {"registro": registro, "nuevo_saldo_revolvente": tarjeta["saldo"]}

    result = store.mutate(_apply)
    return {"aplicado": True, "folio": folio, **result}


@mcp.tool()
def listar_planes_activos() -> dict[str, Any]:
    """Planes de reestructura ya contratados por el cliente."""
    return {"planes": store.read()["planes_aplicados"]}


if __name__ == "__main__":
    # stateless_http=True: cada request es independiente -> N réplicas detrás
    # de un balanceador sin sesión pegajosa.
    if "--http" in sys.argv:
        idx = sys.argv.index("--http")
        port = int(sys.argv[idx + 1]) if len(sys.argv) > idx + 1 else 8081
        mcp.run(transport="streamable-http", host="0.0.0.0", port=port, stateless_http=True)
    else:
        mcp.run()
