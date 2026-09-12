"""El dominio: si la aritmética financiera miente, la UI miente bonito."""
import importlib.util, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mcp_servers"))
spec = importlib.util.spec_from_file_location("credito_server", ROOT / "mcp_servers/credito/server.py")
credito = importlib.util.module_from_spec(spec)
spec.loader.exec_module(credito)


def test_pago_mensual_anualidad_estandar():
    # 100,000 a 12% anual en 12 meses -> 8,884.88 (fórmula de anualidad)
    assert round(credito._pago_mensual(100_000, 0.12, 12), 2) == 8884.88


def test_tabla_amortizacion_liquida_el_saldo():
    t = credito.tabla_amortizacion(18400, 12)
    assert len(t["filas"]) == 12
    assert t["filas"][-1]["saldo"] == 0.0
    assert t["interes_total"] > 0


def test_simulacion_devuelve_opciones_comparables():
    sim = credito.simular_reestructura()
    ids = [o["id"] for o in sim["opciones"]]
    assert ids == ["12m", "18m", "24m", "36m"]
    pagos = [o["pago_mensual"] for o in sim["opciones"]]
    assert pagos == sorted(pagos, reverse=True)   # más plazo, menor pago
    assert all(o["cat_aproximado"] > o["tasa_anual"] for o in sim["opciones"][1:])


def test_accion_exige_confirmacion_explicita():
    r = credito.aplicar_plan_reestructura("12m", 18400, confirmado=False)
    assert r["aplicado"] is False and r["requiere_confirmacion"]


def test_accion_confirmada_cambia_el_estado(tmp_path, monkeypatch):
    from common import store
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "state.json")
    antes = credito.obtener_saldo_tarjeta()["saldo"]
    r = credito.aplicar_plan_reestructura("12m", 18400, confirmado=True)
    assert r["aplicado"] and r["folio"].startswith("RE-")
    assert credito.obtener_saldo_tarjeta()["saldo"] < antes
    assert credito.listar_planes_activos()["planes"]
