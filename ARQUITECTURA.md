# Arquitectura — entregable 04 (decisiones y trade-offs)

> Este archivo vive en `documentacion/` y está en `.gitignore`.
> Para la entrega, copia las secciones "Diagrama" y "Trade-offs" al README o
> al slide técnico.

## 1. Diagrama

```
                     ┌───────────────────────── FRONTEND (fuera de este repo) ──┐
                     │  renderer A2UI  ·  catálogo propio  ·  WebSocket         │
                     └───────▲──────────────────────────────┬───────────────────┘
           envelopes A2UI    │                              │  user_message | action
                             │                              ▼
┌────────────────────────────┴──────────────────────────────────────────────────┐
│ HARNESS (FastAPI, sin estado en el proceso)                                   │
│                                                                               │
│  app.py ──▶ session store (memory | Redis)                                    │
│     │                                                                         │
│     ▼                                                                         │
│  agent/loop.py  (agnóstico de proveedor)                                      │
│     │  FASE 1 · razonamiento        FASE 2 · composición de UI                │
│     │  bucle de tools acotado       modo JSON ──▶ plan de UI                  │
│     │        │                                                                │
│     │        ▼                                                                │
│     │  providers/  ── flag de código: gemini | anthropic | claude_code        │
│     │                 | antigravity | hybrid | fake                           │
│     ▼                                          │                              │
│  mcpx/manager.py                               ▼                              │
│     │  namespacing servidor__tool      a2ui/composer.py                       │
│     │  sanitizador de esquemas         valida contra catálogo · poda · repara │
│     ▼                                          │                              │
└─────┼──────────────────────────────────────────┼──────────────────────────────┘
      │ stdio / streamable-http                  ▼
┌─────▼──────────┐ ┌──────────────┐        envelopes A2UI v0.9.1
│ MCP credito    │ │ MCP banca    │    createSurface · updateDataModel
│ 6 tools        │ │ 4 tools      │    · updateComponents
│ 1 acción real  │ │ 1 acción real│
└───────┬────────┘ └──────┬───────┘
        └────────┬────────┘
          data/state.json  (estado sintético persistente)
```

## 2. El ciclo, en una frase

El usuario expresa una necesidad → el agente trae datos reales por MCP → decide
qué pantalla resuelve eso → el composer la valida y la emite en A2UI → la persona
toca un control → ese evento **regresa al agente como contexto** y produce una
acción real más una pantalla nueva. El ciclo se cierra; no es una pantalla única.

## 3. Trade-offs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Proveedor como **flag de código** (ADR 0005) | selector de modelo en la UI | Reproducibilidad, costo auditable y superficie de ataque. En banca el modelo es decisión de arquitectura, no preferencia de usuario. |
| Cuatro proveedores tras un contrato de una operación | acoplarse a un SDK | Si se cae la cuota de un vendor a media competencia, se cambia una variable. Los CLIs (`claude`, `agy`) corren con la suscripción local, sin API key. |
| Function calling **manual** | `tools=[mcp_session]` del SDK de Google (MCP nativo, experimental) | El SDK esconde el bucle: no puedes emitir "consultando tu saldo…", ni auditar tool calls, ni cortar por presupuesto. En una demo en vivo el control vale más que 5 líneas ahorradas. |
| **Dos fases** (razonar / componer) | Un solo prompt que razona y emite UI | Separar reduce alucinación: en la fase 2 el modelo solo ve el catálogo y los datos ya obtenidos. Además cada fase se puede cambiar de modelo por separado (razonar con Pro, componer con Flash). Costo: una llamada extra (~0.6 s con Flash). |
| Plan de UI propio → **composer** traduce a A2UI | El LLM emite A2UI crudo | Un error de protocolo nunca llega al cliente; el validador poda, repara y en el peor caso cae a una superficie mínima. Migrar de A2UI v0.9.1 a v1.0 es tocar `messages.py`, no el prompt. |
| **Catálogo como fuente única** | Componentes hardcodeados en el prompt | El mismo JSON alimenta al modelo, al validador y al frontend. Agregar un componente es un archivo, no tres. |
| `response_mime_type="application/json"` + reparación | `response_schema` estricto | El schema estricto de Gemini no modela bien props heterogéneas por componente. La reparación con los errores del validador converge en un intento. |
| MCP por **stdio en dev, HTTP en prod** | Solo uno | stdio es cero fricción para desarrollar; streamable-http `stateless_http=True` permite N réplicas sin sesión pegajosa. Misma config, distinto `transport`. |
| Estado sintético en JSON con lock | Postgres | La acción cambia estado de verdad y sobrevive al turno. Migrar es reemplazar `read()` y `mutate()`. |
| `memory` → `redis` por variable de entorno | Solo memoria | El harness ya es sin estado; escalar a 3 réplicas es `SESSION_BACKEND=redis`. |

## 4. Escalamiento

- **Harness**: sin estado de proceso. `docker compose --profile scale up --scale harness=3`.
- **MCP**: cada dominio es su propio contenedor y escala por separado; el más caro
  (simulaciones) no arrastra al resto.
- **Modelo**: los roles `reasoning` y `ui` son independientes dentro de cada perfil
  (ver `hybrid`): se puede razonar con un modelo grande y componer con uno rápido. Si la
  composición se vuelve el cuello de botella, se cachea por (intención, hash de datos).
- **Presupuestos**: `MAX_TOOL_STEPS`, `MAX_COMPONENTS`, `MAX_HISTORY_TURNS`
  acotan latencia y costo por turno. Un turno no puede irse de precio.

## 5. Límites honestos (decirlos antes de que los pregunten)

- El CAT es una aproximación por TIR, no la metodología de Banxico.
- No hay autenticación: el `session_id` es opaco pero no autenticado. En producción
  va detrás de OAuth y las acciones se firman.
- La fase 2 puede producir una pantalla pobre si los datos vienen vacíos; el
  fallback garantiza que algo renderiza, no que sea la mejor pantalla.
- A2UI v0.9.1 es un objetivo móvil (v1.0 ya es candidata). El aislamiento en
  `a2ui/messages.py` es justamente por eso.

## 6. Fuentes

- A2UI — protocolo, mensajes y catálogos: https://a2ui.org/ (spec v0.9.1) ·
  anuncio: https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/
- A2UI v0.9, cambios de nomenclatura (`beginRendering`→`createSurface`,
  `surfaceUpdate`→`updateComponents`): https://www.copilotkit.ai/blog/a2ui-whats-new-in-google-generative-ui-spec
- Model Context Protocol: https://modelcontextprotocol.io/ · SDK Python: https://github.com/modelcontextprotocol/python-sdk
- Google Gen AI SDK (function calling, soporte MCP experimental): https://github.com/googleapis/python-genai ·
  https://ai.google.dev/gemini-api/docs/generate-content/function-calling
- Anthropic Messages API y tool use: https://docs.claude.com/en/docs/build-with-claude/tool-use
- Claude Code headless: https://code.claude.com/docs/en/headless
- Antigravity CLI (`agy`), print mode con salida estructurada:
  https://github.com/google-antigravity/antigravity-cli
- Reto: `Reto_UI_Generativa_Banorte_Tec.pdf` (Banorte × Tec de Monterrey).
