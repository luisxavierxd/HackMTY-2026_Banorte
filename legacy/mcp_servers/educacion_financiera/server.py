#!/usr/bin/env python3
"""Servidor MCP — dominio EDUCACIÓN FINANCIERA.

Dominio de consulta/explicación, no de acción real: las tools no mutan
estado. Cada respuesta incluye **series de datos listos para animar o
graficar** (no solo el número final), para que el frontend custom pueda
pintar curvas creciendo, barras comparativas o líneas de tiempo.

Contrato para el frontend custom (Figma / código):
  - Toda serie viene como lista de dicts con la misma forma.
  - El campo "serie" siempre es una lista de puntos ordenados (mes 1..N).
  - El campo "resumen" es un dict con los agregados finales.
  - Cada tool documenta la forma exacta de su respuesta.

Transporte: stdio por defecto; `--http` levanta streamable-http en :8083.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import store
from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

mcp = MCPServer("educacion_financiera", version="1.0.0")

# ── Constantes didácticas ──────────────────────────────────────────────

INFLACION_ANUAL_MX = 0.045

# Todas las tools son cálculos puros: no escriben estado, misma entrada da la
# misma salida y no salen a la red. Leer GENUI_DB local no cuenta como mundo
# abierto.
READ_ONLY_CALC = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)


# ── Tools ──────────────────────────────────────────────────────────────


@mcp.tool(annotations=READ_ONLY_CALC)
def explicar_interes_compuesto(
    capital: float = 10000.0,
    tasa_anual: float = 0.30,
    meses: int = 24,
) -> dict[str, Any]:
    """Simula cómo crece una deuda con interés compuesto mes a mes.

    Devuelve la serie completa para animar la curva de crecimiento.

    Args:
        capital: monto inicial de la deuda.
        tasa_anual: tasa nominal anual (ej. 0.30 = 30%).
        meses: horizonte de simulación.

    Forma de la serie:
        [{"mes": 1, "saldo": ..., "interes_acumulado": ...}, ...]
    """
    i = tasa_anual / 12
    serie = []
    saldo = capital
    interes_acum = 0.0
    for m in range(1, meses + 1):
        interes = saldo * i
        interes_acum += interes
        saldo += interes
        serie.append({
            "mes": m,
            "saldo": round(saldo, 2),
            "interes_acumulado": round(interes_acum, 2),
        })
    return {
        "concepto": "interes_compuesto",
        "parametros": {"capital": capital, "tasa_anual": tasa_anual, "meses": meses},
        "serie": serie,
        "resumen": {
            "saldo_final": round(saldo, 2),
            "interes_total": round(interes_acum, 2),
            "factor_crecimiento": round(saldo / capital, 4),
        },
        "explicacion": (
            f"Con una tasa anual de {tasa_anual:.0%}, una deuda de "
            f"${capital:,.0f} se convierte en ${saldo:,.0f} en {meses} meses "
            f"si no se paga nada — el interés genera más interés."
        ),
    }


@mcp.tool(annotations=READ_ONLY_CALC)
def comparar_pago_minimo_vs_fijo(
    pago_fijo: float | None = None,
) -> dict[str, Any]:
    """Compara pagar solo el mínimo vs. un pago fijo mayor en la tarjeta del cliente.

    Devuelve dos series paralelas para animar lado a lado.

    Args:
        pago_fijo: pago mensual fijo a comparar. Si se omite, se usa 2× el mínimo.

    Forma de cada serie:
        [{"mes": 1, "saldo": ..., "pagado_acumulado": ...}, ...]
    """
    st = store.read()
    t = st["tarjetas"][0]
    saldo_ini = t["saldo"]
    tasa = t["tasa_anual"]
    minimo = t["pago_minimo"]
    fijo = pago_fijo or round(minimo * 2, 2)
    i = tasa / 12

    def _simular(pago_mensual: float, tope: int = 600) -> list[dict]:
        saldo = saldo_ini
        pagado = 0.0
        serie = []
        mes = 0
        while saldo > 0.01 and mes < tope:
            mes += 1
            interes = saldo * i
            pago_real = min(pago_mensual, saldo + interes)
            saldo = saldo + interes - pago_real
            pagado += pago_real
            serie.append({
                "mes": mes,
                "saldo": round(max(saldo, 0), 2),
                "pagado_acumulado": round(pagado, 2),
            })
        return serie

    serie_minimo = _simular(minimo)
    serie_fijo = _simular(fijo)

    costo_minimo = serie_minimo[-1]["pagado_acumulado"] if serie_minimo else 0
    costo_fijo = serie_fijo[-1]["pagado_acumulado"] if serie_fijo else 0

    return {
        "concepto": "pago_minimo_vs_fijo",
        "saldo_inicial": saldo_ini,
        "escenarios": {
            "pago_minimo": {
                "pago_mensual": minimo,
                "meses_para_liquidar": len(serie_minimo),
                "costo_total": costo_minimo,
                "serie": serie_minimo,
            },
            "pago_fijo": {
                "pago_mensual": fijo,
                "meses_para_liquidar": len(serie_fijo),
                "costo_total": costo_fijo,
                "serie": serie_fijo,
            },
        },
        "resumen": {
            "ahorro": round(costo_minimo - costo_fijo, 2),
            "meses_menos": len(serie_minimo) - len(serie_fijo),
        },
        "explicacion": (
            f"Pagando ${fijo:,.0f}/mes en vez de solo el mínimo (${minimo:,.0f}), "
            f"liquidas {len(serie_minimo) - len(serie_fijo)} meses antes y "
            f"ahorras ${costo_minimo - costo_fijo:,.0f} en intereses."
        ),
    }


@mcp.tool(annotations=READ_ONLY_CALC)
def simular_meta_ahorro(
    meta: float = 50000.0,
    plazo_meses: int = 12,
    tasa_ahorro_anual: float = 0.08,
) -> dict[str, Any]:
    """Simula cuánto ahorrar al mes para alcanzar una meta, con y sin rendimiento.

    Devuelve dos series: con rendimiento y sin rendimiento, para mostrar el
    efecto de invertir vs. guardar bajo el colchón.

    Args:
        meta: cantidad objetivo.
        plazo_meses: en cuántos meses quieres llegar.
        tasa_ahorro_anual: tasa de rendimiento anual esperada.

    Forma de cada serie:
        [{"mes": 1, "acumulado": ..., "aportacion_mes": ...}, ...]
    """
    i = tasa_ahorro_anual / 12

    aporte_sin = meta / plazo_meses
    if i > 0:
        aporte_con = meta * i / ((1 + i) ** plazo_meses - 1)
    else:
        aporte_con = aporte_sin

    serie_sin, serie_con = [], []
    acum_sin, acum_con = 0.0, 0.0
    for m in range(1, plazo_meses + 1):
        acum_sin += aporte_sin
        serie_sin.append({"mes": m, "acumulado": round(acum_sin, 2), "aportacion_mes": round(aporte_sin, 2)})

        rendimiento = acum_con * i
        acum_con = acum_con + aporte_con + rendimiento
        serie_con.append({"mes": m, "acumulado": round(acum_con, 2), "aportacion_mes": round(aporte_con, 2)})

    return {
        "concepto": "meta_ahorro",
        "parametros": {"meta": meta, "plazo_meses": plazo_meses, "tasa_ahorro_anual": tasa_ahorro_anual},
        "escenarios": {
            "sin_rendimiento": {
                "aporte_mensual": round(aporte_sin, 2),
                "total_aportado": round(aporte_sin * plazo_meses, 2),
                "serie": serie_sin,
            },
            "con_rendimiento": {
                "aporte_mensual": round(aporte_con, 2),
                "total_aportado": round(aporte_con * plazo_meses, 2),
                "rendimiento_ganado": round(meta - aporte_con * plazo_meses, 2),
                "serie": serie_con,
            },
        },
        "resumen": {
            "ahorro_mensual_gracias_a_rendimiento": round(aporte_sin - aporte_con, 2),
        },
        "explicacion": (
            f"Para juntar ${meta:,.0f} en {plazo_meses} meses, necesitas "
            f"${aporte_sin:,.0f}/mes sin rendimiento, o ${aporte_con:,.0f}/mes "
            f"con rendimiento al {tasa_ahorro_anual:.0%} anual — te ahorras "
            f"${aporte_sin - aporte_con:,.0f} por mes."
        ),
    }


@mcp.tool(annotations=READ_ONLY_CALC)
def explicar_cat(
    monto: float = 100000.0,
    plazo_meses: int = 12,
    tasa_anual: float = 0.289,
    comision_apertura: float = 0.01,
    seguro_mensual: float = 150.0,
) -> dict[str, Any]:
    """Explica qué es el CAT y por qué es mayor que la tasa de interés.

    Desglosa los componentes del costo total del crédito y calcula un CAT
    aproximado, devolviendo la serie de flujos para visualizar de dónde
    sale cada peso.

    Args:
        monto: principal del crédito.
        plazo_meses: número de pagos.
        tasa_anual: tasa nominal anual.
        comision_apertura: proporción cobrada al inicio (ej. 0.01 = 1%).
        seguro_mensual: costo del seguro mensual asociado al crédito.

    Forma de la serie:
        [{"mes": 1, "pago_base": ..., "interes": ..., "capital": ...,
          "seguro": ..., "pago_total": ..., "saldo": ...}, ...]
    """
    i = tasa_anual / 12
    if i == 0:
        pago_base = monto / plazo_meses
    else:
        pago_base = monto * i / (1 - (1 + i) ** -plazo_meses)

    comision = monto * comision_apertura
    neto_recibido = monto - comision

    serie = []
    saldo = monto
    total_interes = 0.0
    total_seguro = 0.0
    for m in range(1, plazo_meses + 1):
        interes = saldo * i
        capital = pago_base - interes
        saldo = max(saldo - capital, 0)
        total_interes += interes
        total_seguro += seguro_mensual
        serie.append({
            "mes": m,
            "pago_base": round(pago_base, 2),
            "interes": round(interes, 2),
            "capital": round(capital, 2),
            "seguro": round(seguro_mensual, 2),
            "pago_total": round(pago_base + seguro_mensual, 2),
            "saldo": round(saldo, 2),
        })

    costo_total = pago_base * plazo_meses + total_seguro + comision
    flujos = [-(neto_recibido)] + [pago_base + seguro_mensual] * plazo_meses
    cat = _tir_anualizada(flujos)

    return {
        "concepto": "cat",
        "parametros": {
            "monto": monto, "plazo_meses": plazo_meses,
            "tasa_anual": tasa_anual, "comision_apertura": comision_apertura,
            "seguro_mensual": seguro_mensual,
        },
        "serie": serie,
        "desglose_costo": {
            "capital": round(monto, 2),
            "intereses": round(total_interes, 2),
            "comision_apertura": round(comision, 2),
            "seguros": round(total_seguro, 2),
            "costo_total": round(costo_total, 2),
        },
        "resumen": {
            "tasa_anual": tasa_anual,
            "cat_aproximado": cat,
            "diferencia": round(cat - tasa_anual, 4),
            "neto_recibido": round(neto_recibido, 2),
        },
        "explicacion": (
            f"La tasa es {tasa_anual:.1%}, pero el CAT es {cat:.1%} porque "
            f"incluye la comisión de apertura (${comision:,.0f}) y el seguro "
            f"(${seguro_mensual:,.0f}/mes = ${total_seguro:,.0f} total). "
            f"El CAT es el costo REAL anualizado de todo junto."
        ),
    }


@mcp.tool(annotations=READ_ONLY_CALC)
def visualizar_inflacion(
    monto: float = 10000.0,
    anios: int = 5,
    inflacion_anual: float = INFLACION_ANUAL_MX,
) -> dict[str, Any]:
    """Muestra cómo la inflación reduce el poder adquisitivo del dinero.

    Devuelve serie anual del poder de compra real.

    Args:
        monto: cantidad actual.
        anios: horizonte en años.
        inflacion_anual: tasa de inflación anual estimada.

    Forma de la serie:
        [{"anio": 1, "valor_nominal": ..., "poder_compra_real": ...}, ...]
    """
    serie = []
    for a in range(1, anios + 1):
        poder = monto / (1 + inflacion_anual) ** a
        serie.append({
            "anio": a,
            "valor_nominal": round(monto, 2),
            "poder_compra_real": round(poder, 2),
            "perdida_porcentual": round((1 - poder / monto) * 100, 2),
        })
    return {
        "concepto": "inflacion",
        "parametros": {"monto": monto, "anios": anios, "inflacion_anual": inflacion_anual},
        "serie": serie,
        "resumen": {
            "poder_compra_final": round(monto / (1 + inflacion_anual) ** anios, 2),
            "perdida_total": round(monto - monto / (1 + inflacion_anual) ** anios, 2),
        },
        "explicacion": (
            f"${monto:,.0f} de hoy equivalen a "
            f"${monto / (1 + inflacion_anual) ** anios:,.0f} en {anios} años "
            f"con inflación de {inflacion_anual:.1%}. Si no inviertes, pierdes "
            f"poder de compra cada año."
        ),
    }


@mcp.tool(annotations=READ_ONLY_CALC)
def regla_50_30_20(ingreso_mensual: float | None = None) -> dict[str, Any]:
    """Aplica la regla 50/30/20 al ingreso del cliente y compara con su gasto real.

    Devuelve el presupuesto ideal y la comparación categoría por categoría
    con el gasto actual, para mostrar dónde ajustar.

    Args:
        ingreso_mensual: ingreso del cliente. Si se omite, se toma del perfil.

    Forma de la comparación:
        [{"grupo": "necesidades", "ideal": ..., "real": ..., "diferencia": ...}, ...]
    """
    st = store.read()
    ingreso = ingreso_mensual or st["cliente"]["ingreso_mensual"]

    CATEGORIAS_NECESIDADES = {"despensa", "vivienda", "transporte", "salud", "servicios"}
    CATEGORIAS_DESEOS = {"comida fuera", "entretenimiento", "ropa", "suscripciones"}

    gasto_nec, gasto_des, gasto_otro = 0.0, 0.0, 0.0
    for mov in st["movimientos"]:
        if mov["monto"] >= 0:
            continue
        cat = mov["categoria"]
        monto_abs = -mov["monto"]
        if cat in CATEGORIAS_NECESIDADES:
            gasto_nec += monto_abs
        elif cat in CATEGORIAS_DESEOS:
            gasto_des += monto_abs
        else:
            gasto_otro += monto_abs

    ideal_nec = ingreso * 0.50
    ideal_des = ingreso * 0.30
    ideal_aho = ingreso * 0.20

    gasto_total = gasto_nec + gasto_des + gasto_otro
    ahorro_real = ingreso - gasto_total

    comparacion = [
        {
            "grupo": "necesidades",
            "porcentaje_ideal": 50,
            "ideal": round(ideal_nec, 2),
            "real": round(gasto_nec, 2),
            "diferencia": round(ideal_nec - gasto_nec, 2),
            "status": "ok" if gasto_nec <= ideal_nec else "excedido",
        },
        {
            "grupo": "deseos",
            "porcentaje_ideal": 30,
            "ideal": round(ideal_des, 2),
            "real": round(gasto_des, 2),
            "diferencia": round(ideal_des - gasto_des, 2),
            "status": "ok" if gasto_des <= ideal_des else "excedido",
        },
        {
            "grupo": "ahorro_e_inversión",
            "porcentaje_ideal": 20,
            "ideal": round(ideal_aho, 2),
            "real": round(ahorro_real, 2),
            "diferencia": round(ahorro_real - ideal_aho, 2),
            "status": "ok" if ahorro_real >= ideal_aho else "insuficiente",
        },
    ]

    return {
        "concepto": "regla_50_30_20",
        "ingreso_mensual": round(ingreso, 2),
        "comparacion": comparacion,
        "resumen": {
            "gasto_total": round(gasto_total, 2),
            "ahorro_real": round(ahorro_real, 2),
            "ahorro_como_porcentaje": round(ahorro_real / ingreso * 100, 2) if ingreso else 0,
        },
        "explicacion": (
            f"De tu ingreso de ${ingreso:,.0f}, la regla dice destinar "
            f"${ideal_nec:,.0f} a necesidades, ${ideal_des:,.0f} a deseos "
            f"y ${ideal_aho:,.0f} a ahorro. Hoy ahorras ${ahorro_real:,.0f} "
            f"({ahorro_real / ingreso * 100:.0f}% de tu ingreso)."
        ),
    }


# ── Helpers ────────────────────────────────────────────────────────────


def _tir_anualizada(flujos: list[float]) -> float:
    """TIR mensual biseccionada y anualizada (compuesta)."""
    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2
        vp = sum(f / (1 + mid) ** t for t, f in enumerate(flujos))
        if vp > 0:
            lo = mid
        else:
            hi = mid
    return round((1 + (lo + hi) / 2) ** 12 - 1, 4)


# ── main ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--http" in sys.argv:
        idx = sys.argv.index("--http")
        port = int(sys.argv[idx + 1]) if len(sys.argv) > idx + 1 else 8083
        mcp.run(transport="streamable-http", host="0.0.0.0", port=port, stateless_http=True)
    else:
        mcp.run()
