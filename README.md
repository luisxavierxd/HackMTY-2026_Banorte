# GenUI Harness — LLM + MCP + A2UI

Backend de una experiencia financiera donde **el agente construye la interfaz**,
no solo la respuesta. Reto Banorte × Tec de Monterrey.

```
Usuario ──▶ Agente (Gemini) ──▶ MCP (datos + acciones) ──▶ A2UI ──▶ Componentes
   ▲                                                                    │
   └──────────────── la interacción regresa como contexto ──────────────┘
```

Este repo contiene el **harness completo**: agente, servidores MCP de dominio,
catálogo de componentes y la capa A2UI. El frontend se conecta por WebSocket y
renderiza; el contrato está en `GET /a2ui/catalog.json`.

---

## Correr en 3 comandos

```bash
cp .env.example .env          # pega la API key del perfil que vayas a usar
pip install -e ".[dev]"
make demo                     # http://localhost:8080
```

## El modelo es un flag de despliegue

El proveedor y el modelo se fijan en `PROVIDER_PROFILES` (`src/harness/config.py`)
y se seleccionan con `LLM_PROVIDER`. **No son una opción del usuario final**: no
hay endpoint ni campo del WebSocket que los cambie (ver `documentacion/adr/0005`).

| Perfil | Motor | Requiere | Comando |
|---|---|---|---|
| `gemini` | Gemini API (Google AI Studio) | `GOOGLE_API_KEY` | `make demo` |
| `anthropic` | Anthropic Messages API | `ANTHROPIC_API_KEY` | `make demo-anthropic` |
| `claude_code` | CLI `claude` headless | suscripción local | `make demo-code` |
| `antigravity` | CLI `agy` headless | cuenta de Google | `make demo-agy` |
| `hybrid` | razona con API, compone con CLI | la del razonador | `LLM_PROVIDER=hybrid make dev` |
| `fake` | sin modelo; MCP + A2UI reales | nada | `make demo-offline` |

`make providers` los lista. `GET /readyz` reporta cuál está activo.

Los cuatro perfiles corren **el mismo ciclo**: mismo MCP, mismo catálogo, mismo
validador, mismos envelopes A2UI. Con los CLIs el modelo solo *decide* qué
herramienta llamar; **ejecutarla sigue siendo del harness**, así que la traza y la
auditoría no cambian.

Con Docker (harness + MCP educación financiera por HTTP):

```bash
docker compose up --build
```

Verificar:

```bash
curl localhost:8080/readyz                      # MCP + proveedor y modelo activos
python scripts/smoke_turn.py "¿Qué es el interés compuesto?"
make test                                       # 60 tests, sin red
```

---

## API

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/healthz` | liveness |
| `GET` | `/readyz` | estado por servidor MCP + herramientas montadas |
| `GET` | `/a2ui/catalog.json` | **catálogo de componentes** — el frontend lo lee al arrancar |
| `GET` | `/a2ui/tools` | herramientas MCP expuestas al modelo |
| `WS` | `/ws/{session_id}` | canal principal (bidireccional) |
| `POST` | `/v1/turn` | mismo ciclo vía SSE (curl, serverless) |
| `DELETE` | `/v1/session/{id}` | reinicia la conversación |

### Protocolo del WebSocket

Cliente → servidor:

```json
{"type": "user_message", "text": "quiero pagar menos intereses"}
{"type": "action", "name": "aplicar_plan", "params": {"plan_id": "12m"},
 "dataModel": {"/plan/selected": "12m"}}
```

Servidor → cliente (stream de eventos):

| `type` | contenido |
|---|---|
| `tool_call` / `tool_result` | para mostrar "consultando tu saldo…" |
| `surface` | `title`, `summary` y `a2ui`: envelopes **A2UI v0.9.1** listos para render |
| `turn_end` | `latency_ms`, `tools_used`, `provider`, `model`, `usage` |
| `error` | el turno falló; la conexión sigue viva |

Los envelopes son estándar A2UI: `createSurface` → `updateDataModel` → `updateComponents`.

---

## Estructura

```
src/harness/
  a2ui/        catálogo propio, validador, composer, envelopes v0.9.1
  agent/       ciclo agnóstico de proveedor y prompts
  providers/   gemini · anthropic · claude_code · antigravity · fake
  mcpx/        cliente multi-servidor MCP + sanitizador de esquemas
  session/     estado (memoria | Redis)
  app.py       FastAPI: WS, SSE, catálogo, health
mcp_servers/
  educacion_financiera/  interés compuesto, pago mínimo vs fijo, meta ahorro, CAT, inflación, regla 50/30/20
  common/                almacén sintético persistente
```

## Agregar un dominio (inversiones, pagos, seguros, educación financiera)

1. `mcp_servers/<dominio>/server.py` con `MCPServer("<dominio>")` y sus `@mcp.tool()`.
2. Agregar la entrada en `mcp_servers.json` (o dejar stdio por defecto en `config.py`).
3. Listo: el harness lo descubre, lo namespacea y el agente lo usa. Cero cambios en el core.

## Stack

Python 3.11+ · FastAPI · `mcp` 2.x · `google-genai` · `anthropic` ·
CLIs `claude` / `agy` en modo headless · A2UI v0.9.1 · Docker.

Los datos son **sintéticos** y viven en `data/state.json`. `make reset` los reinicia.
