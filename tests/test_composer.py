"""El composer es determinista: se prueba sin tocar el modelo ni la red."""
from harness.a2ui.composer import compile_plan, fallback_plan, validate_components
from harness.a2ui.messages import pointer_get, pointer_set

PLAN_OK = {
    "title": "Reestructura",
    "root": "root",
    "data": {"plan": {"selected": "12m"}},
    "components": [
        {"id": "root", "component": "Column", "props": {"children": ["kpi", "opts", "cta"]}},
        {"id": "kpi", "component": "MetricCard", "props": {"label": "Saldo", "value": "$18,400"}},
        {"id": "opts", "component": "OptionList", "props": {
            "options": [{"id": "12m", "label": "12 meses", "caption": "CAT 32.4%", "value": "$1,690"}],
            "value": {"path": "/plan/selected"},
        }},
        {"id": "cta", "component": "ActionButton", "props": {
            "text": "Aplicar plan",
            "action": {"event": {"name": "aplicar_plan", "params": {}}},
        }},
    ],
}


def test_plan_valido_compila_a_tres_envelopes():
    r = compile_plan(PLAN_OK, "main", first_render=True)
    assert r.ok
    keys = [next(k for k in m if k != "version") for m in r.messages]
    assert keys == ["createSurface", "updateDataModel", "updateComponents"]
    assert r.messages[0]["version"] == "v0.9.1"
    assert r.components[0]["id"] == "root"          # root primero
    assert not r.errors


def test_segundo_render_no_recrea_la_superficie():
    r = compile_plan(PLAN_OK, "main", first_render=False)
    assert all("createSurface" not in m for m in r.messages)


def test_componente_alucinado_se_descarta_y_se_reporta():
    plan = {**PLAN_OK, "components": PLAN_OK["components"] + [
        {"id": "x", "component": "PieChart3D", "props": {}}]}
    comps, errors, dropped = validate_components(plan["components"])
    assert "x" in dropped
    assert any("PieChart3D" in e for e in errors)
    assert all(c["component"] != "PieChart3D" for c in comps)


def test_referencia_rota_se_poda_sin_romper_el_render():
    plan = {**PLAN_OK, "components": [
        {"id": "root", "component": "Column", "props": {"children": ["kpi", "fantasma"]}},
        {"id": "kpi", "component": "MetricCard", "props": {"label": "Saldo", "value": "1"}},
    ]}
    r = compile_plan(plan, "main", first_render=True)
    assert r.ok
    root = next(c for c in r.components if c["id"] == "root")
    assert root["children"] == ["kpi"]


def test_enum_invalido_cae_al_default():
    comps, errors, _ = validate_components(
        [{"id": "t", "component": "Text", "props": {"text": "hola", "variant": "neon"}}])
    assert comps[0]["variant"] == "body"
    assert errors


def test_plan_sin_root_no_compila_y_hay_fallback():
    assert not compile_plan({"components": []}, "main", True).ok
    assert compile_plan(fallback_plan("t", "b"), "main", True).ok


def test_line_chart_apunta_por_path_no_copia_numeros():
    # El LineChart real (catalog.py) referencia la serie ya cargada en /datos
    # por path+key, en vez de traer los números copiados al plan de UI.
    comps, errors, _ = validate_components([{
        "id": "lc", "component": "LineChart",
        "props": {
            "title": "Interés compuesto",
            "series": [
                {"label": "saldo", "path": "/datos/explicar_interes_compuesto/serie", "key": "saldo"},
            ],
        },
    }])
    assert not errors
    assert comps[0]["format"] == "currency"  # default


def test_pie_chart_valida_slices():
    comps, errors, _ = validate_components([{
        "id": "pc", "component": "PieChart",
        "props": {"slices": [{"label": "capital", "value": 100000}, {"label": "intereses", "value": 15000}]},
    }])
    assert not errors and comps[0]["component"] == "PieChart"


def test_comparison_bars_requiere_categories():
    comps, errors, _ = validate_components([{"id": "cb", "component": "ComparisonBars", "props": {}}])
    assert any("categories" in e and "falta prop requerida" in e for e in errors)
    assert "categories" not in comps[0]  # el nodo se arma igual, sin la prop faltante


def test_comparison_bars_toneb_default_costo():
    comps, errors, _ = validate_components([{
        "id": "cb", "component": "ComparisonBars",
        "props": {"categories": [{"label": "necesidades", "a": 5000, "b": 4200}]},
    }])
    assert not errors
    assert comps[0]["toneB"] == "costo"


def test_json_pointer():
    doc = {}
    pointer_set(doc, "/plan/selected", "18m")
    assert pointer_get(doc, "/plan/selected") == "18m"
    assert pointer_get(doc, "/no/existe", "d") == "d"
