"""Catálogo de componentes propio (regla 1 del reto: cada equipo construye su UI).

El catálogo es la ÚNICA fuente de verdad compartida entre tres consumidores:
  1. el prompt del agente  -> qué puede pedir
  2. el validador           -> qué se acepta
  3. el frontend            -> qué sabe renderizar (GET /a2ui/catalog.json)

Formato: compatible en espíritu con el "catalog.json" de A2UI v0.9.x
(lista de componentes + props tipadas), reducido a lo que necesitamos.
"""

from __future__ import annotations

from typing import Any

CATALOG_ID = "https://banorte-genui.local/catalogs/fin/v1.json"
CATALOG_VERSION = "1.0.0"

# tipos soportados en props: string | number | boolean | enum | componentId
#   | componentIds | objectList | binding (literal o {"path": "/ptr"})
COMPONENTS: dict[str, dict[str, Any]] = {
    # ---------- layout ----------
    "Column": {
        "doc": "Apila hijos verticalmente. Es el root típico de una superficie.",
        "props": {
            "children": {"type": "componentIds", "required": True},
            "gap": {"type": "enum", "values": ["none", "sm", "md", "lg"], "default": "md"},
        },
    },
    "Row": {
        "doc": "Coloca hijos en línea. Úsalo para 2-3 métricas o botones.",
        "props": {
            "children": {"type": "componentIds", "required": True},
            "align": {"type": "enum", "values": ["start", "center", "between"], "default": "start"},
        },
    },
    "Card": {
        "doc": "Contenedor con título opcional. Agrupa una idea por tarjeta.",
        "props": {
            "child": {"type": "componentId", "required": True},
            "title": {"type": "string"},
            "variant": {"type": "enum", "values": ["default", "highlight"], "default": "default"},
        },
    },
    "Divider": {"doc": "Separador horizontal.", "props": {}},
    # ---------- contenido ----------
    "Text": {
        "doc": "Texto. variant=amount para cantidades grandes.",
        "props": {
            "text": {"type": "binding", "required": True},
            "variant": {
                "type": "enum",
                "values": ["h1", "h2", "body", "caption", "amount"],
                "default": "body",
            },
        },
    },
    "Badge": {
        "doc": "Etiqueta corta de estado (ej. 'Preaprobado').",
        "props": {
            "text": {"type": "binding", "required": True},
            "tone": {
                "type": "enum",
                "values": ["neutral", "success", "warning", "danger"],
                "default": "neutral",
            },
        },
    },
    "MetricCard": {
        "doc": "Un número que importa, con etiqueta y variación opcional.",
        "props": {
            "label": {"type": "string", "required": True},
            "value": {"type": "binding", "required": True},
            "delta": {"type": "binding"},
            "tone": {
                "type": "enum",
                "values": ["neutral", "success", "warning", "danger"],
                "default": "neutral",
            },
        },
    },
    "DataTable": {
        "doc": "Tabla. rows puede ser literal o binding a una lista del data model.",
        "props": {
            "columns": {"type": "objectList", "required": True, "keys": ["key", "label", "format"]},
            "rows": {"type": "binding", "required": True},
            "maxRows": {"type": "number", "default": 12},
        },
    },
    "BarChart": {
        "doc": "Comparación simple de 2-8 valores.",
        "props": {
            "title": {"type": "string"},
            "series": {"type": "objectList", "required": True, "keys": ["label", "value"]},
            "format": {"type": "enum", "values": ["currency", "percent", "number"], "default": "number"},
            "compare": {"type": "objectList", "keys": ["label", "value"]},
            "goal": {"type": "number"},
            "highlight": {"type": "string"},
            "orientation": {"type": "enum", "values": ["vertical", "horizontal"], "default": "vertical"},
        },
    },
    "LineChart": {
        "doc": "Serie en el tiempo (saldo mes a mes, poder de compra, amortización). "
               "NO copies los números: apunta con 'path' a la serie que ya está en /datos.",
        "props": {
            "title": {"type": "string"},
            "series": {
                "type": "objectList",
                "required": True,
                "keys": ["label", "path", "key", "tone", "emphasis"],
            },
            "xKey": {"type": "string"},
            "xLabel": {"type": "string"},
            "format": {"type": "enum", "values": ["currency", "percent", "number"], "default": "currency"},
            "area": {"type": "boolean", "default": True},
            "annotateLast": {"type": "boolean", "default": True},
        },
    },
    "ProgressRing": {
        "doc": "Avance hacia una meta (ahorro, liquidación de deuda). Un número con contexto, no una gráfica.",
        "props": {
            "label": {"type": "string", "required": True},
            "value": {"type": "binding", "required": True},
            "target": {"type": "number", "required": True},
            "caption": {"type": "binding"},
            "tone": {"type": "enum", "values": ["neutral", "ahorro", "costo"], "default": "ahorro"},
        },
    },
    "PieChart": {
        "doc": "Composición de un total en partes (ej. desglose del CAT: capital, "
               "intereses, comisión, seguros; o el reparto ideal 50/30/20). No la "
               "uses para series en el tiempo, para eso es LineChart.",
        "props": {
            "title": {"type": "string"},
            "slices": {"type": "objectList", "required": True, "keys": ["label", "value"]},
            "format": {"type": "enum", "values": ["currency", "percent", "number"], "default": "currency"},
        },
    },
    "ComparisonBars": {
        "doc": "Compara DOS escenarios lado a lado, categoría por categoría (ej. "
               "pago mínimo vs. pago fijo; gasto ideal vs. gasto real de la regla "
               "50/30/20). Si solo hay un valor por categoría, usa BarChart. Para "
               "un solo valor avanzando hacia una meta, usa ProgressRing (ya existe).",
        "props": {
            "title": {"type": "string"},
            "labelA": {"type": "string", "default": "Escenario A"},
            "labelB": {"type": "string", "default": "Escenario B"},
            "categories": {
                "type": "objectList", "required": True,
                "keys": ["label", "a", "b"],
            },
            "toneB": {"type": "enum", "values": ["neutral", "ahorro", "costo"], "default": "costo"},
            "format": {"type": "enum", "values": ["currency", "percent", "number"], "default": "currency"},
        },
    },
    "Timeline": {
        "doc": "Secuencia de pasos o hitos (ej. 'mes 12: llevas pagado X', 'mes 24: "
               "liquidas'). Úsalo para explicar un proceso paso a paso, no para "
               "graficar una curva continua (eso es LineChart).",
        "props": {
            "title": {"type": "string"},
            "steps": {
                "type": "objectList", "required": True,
                "keys": ["label", "detail", "highlight"],
            },
        },
    },
    "Callout": {
        "doc": "Nota destacada corta (aclaración, advertencia, dato legal). Ej. "
               "'el CAT es una aproximación' o 'esto no es asesoría financiera'.",
        "props": {
            "text": {"type": "binding", "required": True},
            "tone": {
                "type": "enum",
                "values": ["neutral", "success", "warning", "danger"],
                "default": "neutral",
            },
        },
    },
    # ---------- interactivos ----------
    "OptionList": {
        "doc": "Lista de opciones seleccionables (planes, plazos, portafolios). "
               "Escribe la opción elegida en value.path del data model.",
        "props": {
            "options": {
                "type": "objectList",
                "required": True,
                "keys": ["id", "label", "caption", "value", "highlight"],
            },
            "value": {"type": "binding", "required": True},
            "action": {"type": "action"},
        },
    },
    "Slider": {
        "doc": "Entrada numérica continua (monto, plazo, aportación).",
        "props": {
            "label": {"type": "string", "required": True},
            "min": {"type": "number", "required": True},
            "max": {"type": "number", "required": True},
            "step": {"type": "number", "default": 1},
            "value": {"type": "binding", "required": True},
            "format": {"type": "enum", "values": ["currency", "percent", "number"], "default": "number"},
            "action": {"type": "action"},
        },
    },
    "TextField": {
        "doc": "Entrada de texto o número corta.",
        "props": {
            "label": {"type": "string", "required": True},
            "value": {"type": "binding", "required": True},
            "inputType": {"type": "enum", "values": ["text", "number", "email"], "default": "text"},
            "placeholder": {"type": "string"},
        },
    },
    "ActionButton": {
        "doc": "Dispara una acción de negocio. Es lo que cierra el ciclo hacia el agente.",
        "props": {
            "text": {"type": "string", "required": True},
            "action": {"type": "action", "required": True},
            "variant": {"type": "enum", "values": ["primary", "secondary", "ghost"], "default": "primary"},
            "confirm": {"type": "string"},
        },
    },
}


def catalog_document() -> dict[str, Any]:
    """Documento servido en GET /a2ui/catalog.json (contrato con el frontend)."""
    return {
        "catalogId": CATALOG_ID,
        "name": "fin-catalog",
        "version": CATALOG_VERSION,
        "components": COMPONENTS,
    }


def catalog_prompt_digest() -> str:
    """Versión compacta del catálogo para el prompt del agente (ahorra tokens)."""
    lines = []
    for name, spec in COMPONENTS.items():
        props = []
        for pname, p in spec["props"].items():
            t = p["type"]
            if t == "enum":
                t = "|".join(p["values"])
            props.append(f"{pname}:{t}{'*' if p.get('required') else ''}")
        lines.append(f"- {name}({', '.join(props)}) — {spec['doc']}")
    return "\n".join(lines)
