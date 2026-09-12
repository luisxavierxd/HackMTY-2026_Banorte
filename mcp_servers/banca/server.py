#!/usr/bin/env python3
"""Servidor MCP — dominio BANCA PERSONAL (cuentas, movimientos, control de gasto).

Existe para demostrar que el harness es agnóstico de dominio: se monta un
segundo servidor en el registro y el agente lo usa sin tocar una línea del
harness. Los otros cuatro dominios del reto (inversiones, pagos, seguros,
educación financiera) se agregan igual: un archivo, N tools, una entrada
en mcp_servers.json.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import store  # noqa: E402
from mcp.server.mcpserver import MCPServer  # noqa: E402

mcp = MCPServer("banca", version="1.0.0")


@mcp.tool()
def listar_cuentas() -> dict[str, Any]:
    """Cuentas del cliente con saldo actual."""
    cuentas = store.read()["cuentas"]
    return {"cuentas": cuentas, "saldo_total": round(sum(c["saldo"] for c in cuentas), 2)}


@mcp.tool()
def movimientos_recientes(limite: int = 10, categoria: str | None = None) -> dict[str, Any]:
    """Últimos movimientos, opcionalmente filtrados por categoría.

    Args:
        limite: número máximo de movimientos a devolver.
        categoria: filtra por categoría exacta (despensa, transporte, vivienda...).
    """
    movs = store.read()["movimientos"]
    if categoria:
        movs = [m for m in movs if m["categoria"] == categoria]
    return {"movimientos": movs[:limite], "total": len(movs)}


@mcp.tool()
def gasto_por_categoria() -> dict[str, Any]:
    """Suma de egresos agrupada por categoría, ordenada de mayor a menor."""
    acc: dict[str, float] = defaultdict(float)
    for mov in store.read()["movimientos"]:
        if mov["monto"] < 0:
            acc[mov["categoria"]] += -mov["monto"]
    filas = sorted(
        ({"categoria": k, "monto": round(v, 2)} for k, v in acc.items()),
        key=lambda r: r["monto"],
        reverse=True,
    )
    return {"categorias": filas, "gasto_total": round(sum(r["monto"] for r in filas), 2)}


@mcp.tool()
def transferir(origen: str, destino: str, monto: float, confirmado: bool = False) -> dict[str, Any]:
    """ACCIÓN REAL: mueve dinero entre cuentas propias.

    Args:
        origen: id de la cuenta origen (ej. AC-001).
        destino: id de la cuenta destino.
        monto: cantidad a transferir.
        confirmado: debe ser true; solo cuando la persona confirmó en la UI.
    """
    if not confirmado:
        return {"aplicado": False, "requiere_confirmacion": True}

    def _apply(state: dict) -> dict:
        cuentas = {c["id"]: c for c in state["cuentas"]}
        if origen not in cuentas or destino not in cuentas:
            return {"error": "cuenta inexistente"}
        if cuentas[origen]["saldo"] < monto:
            return {"error": "saldo insuficiente", "saldo_disponible": cuentas[origen]["saldo"]}
        cuentas[origen]["saldo"] = round(cuentas[origen]["saldo"] - monto, 2)
        cuentas[destino]["saldo"] = round(cuentas[destino]["saldo"] + monto, 2)
        state["eventos"].append({"tipo": "transferencia", "monto": monto})
        return {
            "saldo_origen": cuentas[origen]["saldo"],
            "saldo_destino": cuentas[destino]["saldo"],
        }

    result = store.mutate(_apply)
    return {"aplicado": "error" not in result, **result}


if __name__ == "__main__":
    # stateless_http=True: cada request es independiente -> N réplicas detrás
    # de un balanceador sin sesión pegajosa.
    if "--http" in sys.argv:
        idx = sys.argv.index("--http")
        port = int(sys.argv[idx + 1]) if len(sys.argv) > idx + 1 else 8082
        mcp.run(transport="streamable-http", host="0.0.0.0", port=port, stateless_http=True)
    else:
        mcp.run()
