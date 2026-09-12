"""Tests para el dominio de educación financiera.

Verifica que cada tool devuelve series con la forma correcta para
que el frontend custom pueda animar/graficar sin adivinar el contrato.
"""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mcp_servers"))
spec = importlib.util.spec_from_file_location(
    "edu_server", ROOT / "mcp_servers/educacion_financiera/server.py"
)
edu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edu)


# ── explicar_interes_compuesto ─────────────────────────────────────────


def test_interes_compuesto_serie_completa():
    r = edu.explicar_interes_compuesto(10000, 0.30, 12)
    assert len(r["serie"]) == 12
    assert r["serie"][0]["mes"] == 1
    assert r["serie"][-1]["mes"] == 12
    assert all("saldo" in p and "interes_acumulado" in p for p in r["serie"])


def test_interes_compuesto_crece_monotonicamente():
    r = edu.explicar_interes_compuesto(10000, 0.30, 24)
    saldos = [p["saldo"] for p in r["serie"]]
    assert saldos == sorted(saldos)


def test_interes_compuesto_resumen_coherente():
    r = edu.explicar_interes_compuesto(10000, 0.12, 12)
    assert r["resumen"]["saldo_final"] == r["serie"][-1]["saldo"]
    assert r["resumen"]["interes_total"] == r["serie"][-1]["interes_acumulado"]
    assert r["resumen"]["factor_crecimiento"] > 1.0


def test_interes_compuesto_tasa_cero():
    r = edu.explicar_interes_compuesto(10000, 0.0, 6)
    assert r["serie"][-1]["saldo"] == 10000.0
    assert r["resumen"]["interes_total"] == 0.0


# ── comparar_pago_minimo_vs_fijo ───────────────────────────────────────


def test_comparar_pagos_devuelve_dos_escenarios():
    r = edu.comparar_pago_minimo_vs_fijo()
    assert "pago_minimo" in r["escenarios"]
    assert "pago_fijo" in r["escenarios"]
    assert len(r["escenarios"]["pago_minimo"]["serie"]) > 0
    assert len(r["escenarios"]["pago_fijo"]["serie"]) > 0


def test_pago_fijo_liquida_antes_que_minimo():
    r = edu.comparar_pago_minimo_vs_fijo()
    assert r["escenarios"]["pago_fijo"]["meses_para_liquidar"] < r["escenarios"]["pago_minimo"]["meses_para_liquidar"]


def test_pago_fijo_cuesta_menos_total():
    r = edu.comparar_pago_minimo_vs_fijo()
    assert r["escenarios"]["pago_fijo"]["costo_total"] < r["escenarios"]["pago_minimo"]["costo_total"]
    assert r["resumen"]["ahorro"] > 0


def test_comparar_pagos_serie_termina_en_cero():
    r = edu.comparar_pago_minimo_vs_fijo()
    for esc in r["escenarios"].values():
        assert esc["serie"][-1]["saldo"] == 0.0


def test_comparar_pagos_con_pago_custom():
    r = edu.comparar_pago_minimo_vs_fijo(pago_fijo=5000.0)
    assert r["escenarios"]["pago_fijo"]["pago_mensual"] == 5000.0


# ── simular_meta_ahorro ───────────────────────────────────────────────


def test_meta_ahorro_dos_escenarios():
    r = edu.simular_meta_ahorro(50000, 12, 0.08)
    assert "sin_rendimiento" in r["escenarios"]
    assert "con_rendimiento" in r["escenarios"]


def test_meta_ahorro_sin_rendimiento_es_lineal():
    r = edu.simular_meta_ahorro(12000, 12, 0.0)
    assert r["escenarios"]["sin_rendimiento"]["aporte_mensual"] == 1000.0


def test_meta_ahorro_con_rendimiento_aporta_menos():
    r = edu.simular_meta_ahorro(50000, 12, 0.08)
    assert r["escenarios"]["con_rendimiento"]["aporte_mensual"] < r["escenarios"]["sin_rendimiento"]["aporte_mensual"]


def test_meta_ahorro_series_tienen_forma_correcta():
    r = edu.simular_meta_ahorro(50000, 6, 0.10)
    for esc in r["escenarios"].values():
        assert len(esc["serie"]) == 6
        assert all("mes" in p and "acumulado" in p and "aportacion_mes" in p for p in esc["serie"])


def test_meta_ahorro_acumulado_crece():
    r = edu.simular_meta_ahorro(50000, 12, 0.08)
    for esc in r["escenarios"].values():
        acumulados = [p["acumulado"] for p in esc["serie"]]
        assert acumulados == sorted(acumulados)


# ── explicar_cat ───────────────────────────────────────────────────────


def test_cat_mayor_que_tasa():
    r = edu.explicar_cat(100000, 12, 0.289, 0.01, 150.0)
    assert r["resumen"]["cat_aproximado"] > r["resumen"]["tasa_anual"]


def test_cat_serie_amortiza_a_cero():
    r = edu.explicar_cat(100000, 12, 0.289, 0.01, 150.0)
    assert len(r["serie"]) == 12
    assert r["serie"][-1]["saldo"] == 0.0


def test_cat_desglose_suma_costo_total():
    r = edu.explicar_cat(100000, 12, 0.289, 0.01, 150.0)
    d = r["desglose_costo"]
    esperado = d["capital"] + d["intereses"] + d["comision_apertura"] + d["seguros"]
    assert abs(d["costo_total"] - esperado) < 1.0


def test_cat_serie_tiene_todos_los_campos():
    r = edu.explicar_cat(100000, 12, 0.289, 0.01, 150.0)
    campos = {"mes", "pago_base", "interes", "capital", "seguro", "pago_total", "saldo"}
    for p in r["serie"]:
        assert campos.issubset(p.keys())


def test_cat_sin_comision_ni_seguro_es_cercano_a_tasa():
    r = edu.explicar_cat(100000, 12, 0.20, 0.0, 0.0)
    assert abs(r["resumen"]["cat_aproximado"] - 0.20) < 0.02


# ── visualizar_inflacion ──────────────────────────────────────────────


def test_inflacion_serie_correcta():
    r = edu.visualizar_inflacion(10000, 5, 0.05)
    assert len(r["serie"]) == 5
    assert r["serie"][0]["anio"] == 1
    assert r["serie"][-1]["anio"] == 5


def test_inflacion_poder_compra_decrece():
    r = edu.visualizar_inflacion(10000, 5, 0.05)
    poderes = [p["poder_compra_real"] for p in r["serie"]]
    assert poderes == sorted(poderes, reverse=True)


def test_inflacion_nominal_se_mantiene():
    r = edu.visualizar_inflacion(10000, 5, 0.05)
    assert all(p["valor_nominal"] == 10000.0 for p in r["serie"])


def test_inflacion_resumen_coherente():
    r = edu.visualizar_inflacion(10000, 3, 0.10)
    esperado = round(10000 / 1.10 ** 3, 2)
    assert r["resumen"]["poder_compra_final"] == esperado


# ── regla_50_30_20 ────────────────────────────────────────────────────


def test_regla_devuelve_tres_grupos():
    r = edu.regla_50_30_20()
    grupos = [c["grupo"] for c in r["comparacion"]]
    assert grupos == ["necesidades", "deseos", "ahorro_e_inversión"]


def test_regla_ideales_suman_100_porciento():
    r = edu.regla_50_30_20()
    assert sum(c["porcentaje_ideal"] for c in r["comparacion"]) == 100


def test_regla_con_ingreso_custom():
    r = edu.regla_50_30_20(ingreso_mensual=100000.0)
    assert r["ingreso_mensual"] == 100000.0
    assert r["comparacion"][0]["ideal"] == 50000.0


def test_regla_status_correcto():
    r = edu.regla_50_30_20()
    for c in r["comparacion"]:
        assert c["status"] in ("ok", "excedido", "insuficiente")
