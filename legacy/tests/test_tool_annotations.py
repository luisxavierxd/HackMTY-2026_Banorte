"""Las tools del servidor de educación financiera declaran los 4 hints de
`ToolAnnotations` del spec MCP, con valores booleanos explícitos.

Lista las tools como las vería un cliente (`list_tools`), sin red.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mcp_servers"))
spec = importlib.util.spec_from_file_location(
    "edu_server_annotations", ROOT / "mcp_servers/educacion_financiera/server.py"
)
edu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edu)

TOOLS = [
    "explicar_interes_compuesto",
    "comparar_pago_minimo_vs_fijo",
    "simular_meta_ahorro",
    "explicar_cat",
    "visualizar_inflacion",
    "regla_50_30_20",
]

HINTS = ("readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint")


@pytest.mark.parametrize("name", TOOLS)
async def test_tool_declara_los_cuatro_hints(name):
    listed = {t.name: t for t in await edu.mcp.list_tools()}
    assert name in listed

    annotations = listed[name].annotations
    assert annotations is not None
    hints = annotations.model_dump(by_alias=True)
    for hint in HINTS:
        assert isinstance(hints.get(hint), bool), f"{name}: {hint}={hints.get(hint)!r}"
