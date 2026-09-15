#!/usr/bin/env python3
"""Exporta el contrato del harness a artefactos estáticos que consume `web/`.

El Python manda. El navegador consume lo que sale de aquí — nunca importa
código de `legacy/` en runtime ni se copia un catálogo a mano.

Emite a `web/public/contract/`:
  catalog.json  idéntico byte a byte a lo que sirve GET /a2ui/catalog.json
  tools.json    idéntico a GET /a2ui/tools

`tools.json` sale de levantar los servidores MCP de verdad y preguntarles,
igual que hace el endpoint: así el nombre calificado, la descripción y el
esquema son exactamente los que ve el modelo, no una transcripción.

    python scripts/export_contract.py            # escribe
    python scripts/export_contract.py --check    # falla si hay drift (CI)
"""

from __future__ import annotations

import argparse
import asyncio
import difflib
import inspect
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# El harness vive en legacy/ y se queda ahí: esto es la ÚNICA costura entre
# los dos targets, y corre en build, nunca en runtime del navegador.
sys.path.insert(0, str(ROOT / "legacy" / "src"))
sys.path.insert(0, str(ROOT / "legacy"))

from harness.a2ui.catalog import catalog_document, catalog_prompt_digest  # noqa: E402
from harness.agent import prompts as py_prompts  # noqa: E402
from harness.config import load_mcp_servers  # noqa: E402
from harness.mcpx.manager import McpManager  # noqa: E402

OUT_DIR = ROOT / "web" / "public" / "contract"


def _clean(description: str) -> str:
    """Normaliza el docstring que el SDK de MCP entrega como `description`.

    Hace falta porque **Python 3.13 empezó a quitarle la sangría a los
    docstrings al compilar**. Con 3.12 la descripción llega con sus 4 espacios
    y cerrando en `\\n    `; con 3.13+ llega ya dedentada. Mismo código fuente,
    dos bytes distintos, y el anti-drift marcaba diferencia solo porque quien
    generó el artefacto usó otra versión que CI — un falso positivo que no dice
    nada sobre Python vs TS, que es lo único que ese check debe vigilar.

    `cleandoc` colapsa las dos formas a la misma, así que el contrato deja de
    depender de con qué Python se generó. De paso el modelo recibe el texto sin
    sangría sobrante, que es como conviene leerlo en el prompt.
    """
    return inspect.cleandoc(description or "")


def _dump(doc: dict) -> str:
    """Serialización estable: sin ella el --check de CI marca drift fantasma."""
    return json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _print_diff(name: str, current: str, generated: str) -> None:
    """Sin esto, `--check` dice QUE hay drift pero no CUÁL, y cuando solo se
    reproduce en CI no queda de dónde agarrarse. Se acota a las primeras
    líneas: basta para ver el patrón y no ahoga el log."""
    diff = list(
        difflib.unified_diff(
            current.splitlines(keepends=True),
            generated.splitlines(keepends=True),
            fromfile=f"{name} (commiteado)",
            tofile=f"{name} (generado ahora)",
            n=1,
        )
    )
    print(f"\n--- diferencias en {name} ---", file=sys.stderr)
    for line in diff[:60]:
        print(line.rstrip("\n"), file=sys.stderr)
    if len(diff) > 60:
        print(f"… y {len(diff) - 60} líneas más", file=sys.stderr)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="no escribe; sale 1 si lo generado difiere de lo commiteado")
    args = ap.parse_args()

    mcp = McpManager(load_mcp_servers())
    await mcp.start()
    try:
        if not mcp.tools:
            print("ningún servidor MCP levantó — no se puede exportar el contrato.",
                  file=sys.stderr)
            return 1
        docs = {
            "catalog.json": catalog_document(),
            "tools.json": {
                "tools": [
                    {
                        "name": t.qualified,
                        "server": t.server,
                        "description": _clean(t.description),
                    }
                    for t in mcp.tools.values()
                ]
            },
            "tool_schemas.json": {
                "schemas": {t.qualified: t.input_schema for t in mcp.tools.values()}
            },
            # Las plantillas de prompt viajan como artefacto en vez de
            # copiarse a TS a mano. Son el punto más frágil del split: nada
            # automático detecta si una copia verbatim diverge, y un prompt
            # desincronizado no rompe el build — degrada las respuestas en
            # silencio, que es peor. Los placeholders ({domain}, {catalog}…)
            # los rellena el TS con los mismos valores.
            "prompts.json": {
                "reasoningSystem": py_prompts.REASONING_SYSTEM,
                "toolManifest": py_prompts.TOOL_MANIFEST,
                "uiSystem": py_prompts.UI_SYSTEM,
                "profileContext": py_prompts.PROFILE_CONTEXT,
                "catalogDigest": catalog_prompt_digest(),
            },
        }
    finally:
        await mcp.aclose()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    drift: list[str] = []
    for name, doc in docs.items():
        path = OUT_DIR / name
        payload = _dump(doc)
        if args.check:
            current = path.read_text(encoding="utf-8") if path.exists() else ""
            if current != payload:
                drift.append(name)
                _print_diff(name, current, payload)
        else:
            path.write_text(payload, encoding="utf-8")
            print(f"escrito {path.relative_to(ROOT)}")

    if drift:
        print(
            "DRIFT en el contrato: " + ", ".join(drift) + "\n"
            "corre `make contract` y commitea.",
            file=sys.stderr,
        )
        return 1
    if args.check:
        print("contrato sin drift")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
