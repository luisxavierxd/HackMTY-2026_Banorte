# ADR 0005 — El proveedor de modelo es un flag de código, no una opción del usuario

**Estado:** aceptado · **Fecha:** 2026-09-11

## Contexto
El reto exige "un LLM al centro" pero deja libre el proveedor. Queremos poder
demostrar con Gemini, con Anthropic o —si no hay cuota, red o presupuesto— con
un CLI agéntico que ya está instalado en la laptop del equipo. La tentación es
exponer un selector de modelo en la UI.

## Decisión
Una capa de proveedores con **una sola operación** (`complete`) y tipos
neutrales. La selección vive en `PROVIDER_PROFILES` (`config.py`) y se elige con
`LLM_PROVIDER`. **Ningún endpoint, header ni mensaje del WebSocket puede
cambiarla en caliente.**

Perfiles: `gemini`, `anthropic`, `claude_code`, `antigravity`, `hybrid`, `fake`.
Cada perfil define proveedor y modelo para dos roles independientes:
`reasoning` (interpretar y decidir herramientas) y `ui` (componer la pantalla).

## Por qué no dejarlo elegir al usuario
- **Reproducibilidad**: un despliegue = un proveedor conocido. Si la demo falla,
  sabemos con qué corrió sin preguntar.
- **Costo**: el gasto por turno es predecible y auditable (`turn_end.usage`).
- **Superficie de ataque**: un modelo elegido por el cliente es una vía para
  degradar salvaguardas o quemar cuota ajena.
- **Producto**: en banca el modelo es una decisión de arquitectura y cumplimiento,
  no una preferencia de usuario.

## Qué absorbe cada proveedor
| | Gemini | Anthropic | CLIs (`claude`, `agy`) |
|---|---|---|---|
| rol del asistente | `model` | `assistant` | n/a (prompt plano) |
| resultado de tool | `function_response` en turno `user` | bloque `tool_result` con `tool_use_id` | texto en el prompt |
| esquema de params | subconjunto de OpenAPI (hay que sanitizar) | **JSON Schema crudo** | manifiesto en el prompt |
| JSON estricto | `response_mime_type` | prefill con `{` | instrucción + reparación |
| function calling | nativo | nativo | **por prompt** (`native_tools=False`) |

Que Anthropic acepte el esquema de MCP sin tocarlo no es casualidad: MCP y la
Messages API comparten linaje. Con Gemini, `sanitize_schema()` es obligatorio.

## Los CLIs: para qué sirven de verdad
No son un truco para presumir. Resuelven un riesgo real de hackathon: quedarse
sin cuota o sin red a mitad de la demo. Corren headless (`-p --output-format json`)
y el harness **sigue ejecutando el MCP**: el CLI solo decide. El ciclo, el
catálogo, el validador y los envelopes A2UI son idénticos en los cuatro perfiles;
eso es lo que hace que la comparación sea honesta.

## Consecuencias
- Cambiar de proveedor no toca el ciclo, el catálogo ni el composer.
- 18 tests cubren la traducción neutral↔nativo sin red ni credenciales.
- `/readyz` reporta qué proveedor y modelo están activos: cero ambigüedad en vivo.
- Costo: mantener cuatro traducciones. Es el precio de no depender de un vendor
  a mitad de una competencia.
- Los CLIs no exponen `temperature` ni streaming: esos perfiles pierden control
  fino de generación. Documentado, no escondido.

## Fuentes
- Anthropic Messages API, tool use: https://docs.claude.com/en/docs/build-with-claude/tool-use
- Gemini function calling: https://ai.google.dev/gemini-api/docs/generate-content/function-calling
- Claude Code headless (`-p`, `--output-format json`, `--mcp-config`, `--bare`):
  https://code.claude.com/docs/en/headless
- Antigravity CLI (`agy`, print mode con `--output-format json|stream-json`):
  https://github.com/google-antigravity/antigravity-cli
