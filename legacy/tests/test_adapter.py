"""El sanitizador de esquemas: lo que evita un 400 de Gemini en vivo."""
from harness.mcpx.adapter import sanitize_schema, tool_to_declaration
from harness.mcpx.manager import ToolRef

PYDANTIC_SCHEMA = {
    "type": "object",
    "title": "simular_reestructuraArguments",
    "properties": {
        "monto": {"anyOf": [{"type": "number"}, {"type": "null"}], "title": "Monto", "default": None},
        "plazos": {"anyOf": [{"type": "array", "items": {"type": "integer"}}, {"type": "null"}]},
        "modo": {"type": "string", "enum": ["rapido", "detallado"]},
    },
    "required": [],
    "additionalProperties": False,
}


def test_anyof_optional_se_aplana_a_nullable():
    out = sanitize_schema(PYDANTIC_SCHEMA)
    assert out["type"] == "OBJECT"
    assert out["properties"]["monto"] == {"type": "NUMBER", "nullable": True}
    assert out["properties"]["plazos"]["items"]["type"] == "INTEGER"


def test_se_eliminan_claves_no_soportadas():
    out = sanitize_schema(PYDANTIC_SCHEMA)
    assert "title" not in out and "additionalProperties" not in out


def test_enum_sobrevive():
    out = sanitize_schema(PYDANTIC_SCHEMA)
    assert out["properties"]["modo"]["enum"] == ["rapido", "detallado"]


def test_ref_se_resuelve():
    schema = {
        "type": "object",
        "$defs": {"Plan": {"type": "object", "properties": {"id": {"type": "string"}}}},
        "properties": {"plan": {"$ref": "#/$defs/Plan"}},
    }
    out = sanitize_schema(schema)
    assert out["properties"]["plan"]["properties"]["id"]["type"] == "STRING"


def test_declaracion_usa_nombre_calificado():
    ref = ToolRef("credito", "simular", "credito__simular", "desc", PYDANTIC_SCHEMA)
    decl = tool_to_declaration(ref)
    assert decl["name"] == "credito__simular"
    assert decl["parameters"]["type"] == "OBJECT"
