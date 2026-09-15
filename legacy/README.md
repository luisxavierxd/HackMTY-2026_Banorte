> ## ⚠️ Estado congelado — no se modifica
>
> Esta carpeta es el **proyecto tal como quedó al cerrar HackMTY 2026**: finalista
> del reto Banorte, íntegro y funcionando. Se conserva completo a propósito.
>
> - **No se borra, no se degrada, no se refactoriza.** Es el respaldo de la versión
>   que sí corrió en la demo en vivo.
> - Todo lo que está aquí funciona como el último día del hackatón: `make test`
>   (94 tests, sin red), `make demo`, `make demo-code`, `docker compose up`.
> - Los comandos de abajo se corren **desde esta carpeta** (`cd legacy`), no desde
>   la raíz del repo.
>
> El trabajo nuevo vive en `web/` en la raíz: una demo permanente que corre entera
> en el navegador, sin backend hospedado. Ver el README de la raíz.
>
> El despliegue de Railway se retiró a propósito en sep-2026 (`railway.toml` se
> conserva aquí como referencia). Este target sigue siendo hospedable y corre local
> sin cambios.

---

# GenUI Harness — LLM + MCP + A2UI

Backend + frontend de una experiencia financiera donde **el agente construye la
interfaz**, no solo la respuesta. Reto Banorte × Tec de Monterrey.

```
Usuario ──▶ Agente (LLM) ──▶ MCP (datos + acciones) ──▶ A2UI ──▶ Componentes
   ▲                                                                    │
   └──────────────── la interacción regresa como contexto ──────────────┘
```

Este repo contiene el **harness completo**: agente, servidor MCP de educación
financiera, catálogo de 19 componentes A2UI, la capa de composición y el
**frontend React** con la mascota Banqui. El frontend se conecta por WebSocket y
renderiza; el contrato está en `GET /a2ui/catalog.json`.

---

## Correr en 3 comandos

```bash
cp .env.example .env          # pega la API key del perfil que vayas a usar
pip install -e ".[dev]"
make demo                     # http://localhost:8080
```

Frontend (en otra terminal):

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
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

Los perfiles corren **el mismo ciclo**: mismo MCP, mismo catálogo, mismo
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
make test                                       # 94 tests, sin red
```

---

## API

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/healthz` | liveness |
| `GET` | `/readyz` | estado por servidor MCP + herramientas montadas |
| `GET` | `/a2ui/catalog.json` | **catálogo de componentes** — el frontend lo lee al arrancar |
| `GET` | `/a2ui/tools` | herramientas MCP expuestas al modelo |
| `WS` | `/ws/{session_id}` | canal principal (bidireccional, con código de acceso) |
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
| `thinking` | texto parcial de razonamiento del agente |
| `surface` | `title`, `summary` y `a2ui`: envelopes **A2UI v0.9.1** listos para render |
| `turn_end` | `latency_ms`, `tools_used`, `provider`, `model`, `usage` |
| `error` | el turno falló; la conexión sigue viva |

Los envelopes son estándar A2UI: `createSurface` → `updateDataModel` → `updateComponents`.

---

## Estructura

```
src/harness/
  a2ui/        catálogo (19 componentes), validador, composer, envelopes v0.9.1
  agent/       ciclo agnóstico de proveedor y prompts
  providers/   gemini · anthropic · cli_agent (claude_code / antigravity) · fake
  mcpx/        cliente multi-servidor MCP + sanitizador de esquemas
  session/     estado (memoria | Redis)
  auth.py      código de acceso (ACCESS_CODE env var)
  app.py       FastAPI: WS, SSE, catálogo, health
mcp_servers/
  educacion_financiera/  interés compuesto, pago mínimo vs fijo, meta ahorro,
                         CAT, inflación, regla 50/30/20 (6 tools, 0 acciones mutantes)
  common/                almacén sintético persistente
frontend/
  src/
    a2ui/        renderer de componentes A2UI + gráficas ECharts (5 adapters)
    contract/    tipos TypeScript del protocolo (a2ui.ts, events.ts)
    design/      tokens CSS (dark/light), base.css
    mascot/      Banqui — mascota animada con poses, bubble y tutorial guiado
    net/         WebSocket, perfil de usuario, conversaciones, código de acceso
    shell/       Home, Composer, Trace, ProfileGate, AccessGate, Sidebar, ThemeToggle
    lab/         galería offline de fixtures (?lab=1)
    App.tsx      orquestador principal
```

## Catálogo A2UI (19 componentes)

Column · Row · Card · MetricCard · Text · Badge · Divider · Callout ·
ActionButton · OptionList · Slider · TextField · DataTable · Timeline ·
LineChart · BarChart · PieChart · ComparisonBars · ProgressRing

## Frontend — Banqui

SPA en React + Vite + TypeScript. Se conecta al harness por WebSocket con
código de acceso y perfil de usuario (nombre, ingreso, ahorro, inversión).

Características:
- Mascota Banqui animada con poses, tutorial guiado paso a paso y narración
- Tema dark/light con tokens CSS y toggle
- Layout bento grid adaptativo para gráficas
- Gráficas interactivas ECharts con tema Banorte (se adaptan al tema dark/light)
- Historial de conversaciones persistente en localStorage
- Sidebar con perfil, conversaciones y logout
- Responsive mobile: mini Banqui junto al composer, Banqui centrado visible
  durante estados de "pensando", nav strip bajo el sidebar

## Agregar un dominio (inversiones, pagos, seguros)

1. `mcp_servers/<dominio>/server.py` con `MCPServer("<dominio>")` y sus `@mcp.tool()`.
2. Agregar la entrada en `mcp_servers.json` (o dejar stdio por defecto en `config.py`).
3. Listo: el harness lo descubre, lo namespacea y el agente lo usa. Cero cambios en el core.

## Stack

**Backend:** Python 3.11+ · FastAPI · `mcp` 2.x · `google-genai` · `anthropic` ·
CLIs `claude` / `agy` en modo headless · A2UI v0.9.1 · Docker.

**Frontend:** React 18 · Vite · TypeScript · ECharts · CSS custom (no framework) ·
diseño liquid glass · mascota SVG animada.

Los datos son **sintéticos** y viven en `data/state.json`. `make reset` los reinicia.
