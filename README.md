# Banky — asistente financiero donde el agente construye la interfaz

Finalista del reto Banorte en HackMTY 2026. El agente no responde con texto:
llama herramientas reales y **compone la pantalla** que las explica.

```
Usuario ──▶ Agente (LLM) ──▶ Herramientas (datos) ──▶ A2UI ──▶ Componentes
   ▲                                                              │
   └──────────── la interacción regresa como contexto ─────────────┘
```

**[Ver demo](https://banky.mx)** — corre entera en el navegador, sin backend.

---

## Dos targets, un repo

| | `web/` | `legacy/` |
|---|---|---|
| Qué es | La demo permanente | El proyecto del hackatón |
| Dónde corre | GitHub Pages (CDN) | Tu máquina o un contenedor |
| Backend | Ninguno | FastAPI + MCP por stdio |
| Proveedor | Lo elige quien visita | Flag de despliegue (`LLM_PROVIDER`) |
| Estado | Activo | **Congelado** — no se toca |

`legacy/` es el respaldo íntegro de lo que corrió en la demo en vivo: harness,
servidor MCP, frontend, 94 tests, Docker. Tiene su propio README y su propio
Makefile. No se borra ni se degrada.

**Regla dura:** `web/` no importa nada de `legacy/` en runtime. Lo único que
cruza son artefactos generados en build (ver *Contrato compartido*).

---

## Los dos links

| URL | Vigencia |
|---|---|
| `https://banky.mx` | **hasta ~sep-2027** — el dominio no se renueva |
| `https://luisxavierxd.github.io/HackMTY-2026_Banorte/` | permanente |

Mientras el custom domain esté activo, GitHub Pages **redirige** el link de
`github.io` hacia `banky.mx`. O sea que hay un solo link vivo a la vez, y
cuando el dominio venza el de respaldo tampoco responde hasta quitar el CNAME
a mano. Por eso el ancla visible en portafolio y Devpost dice "ver demo", no el
dominio: cambiar el `href` no obliga a reescribir el texto.

<details>
<summary><b>Procedimiento cuando venza el dominio</b></summary>

1. Borrar `web/public/CNAME` y quitar el custom domain en Settings → Pages.
2. Re-desplegar con `VITE_BASE=/HackMTY-2026_Banorte/`.
3. Actualizar el `href` en README, Devpost y portafolio.

</details>

---

## Correr la demo

```bash
make web-install      # cd web && npm ci
make web-dev          # http://localhost:5173
```

Al entrar eliges con qué correrla:

| Opción | Pide | Qué hace |
|---|---|---|
| **Ver sesión grabada** | nada | Respuestas pregrabadas con el harness real |
| **Anthropic** | API key | Ciclo completo en tu pestaña |
| **Gemini** | API key | Igual; Google AI Studio tiene tier gratuito |
| **CLI local** | URL + código | Se conecta al harness de `legacy/` corriendo en tu máquina |

Para *CLI local* puedes usar cualquiera de los cuatro agentes; el gate te da el
comando según cuál elijas:

| CLI | Binario | Comando | Credencial |
|---|---|---|---|
| Claude Code | `claude` | `make demo-code` | tu suscripción |
| Codex | `codex` | `make demo-codex` | login de ChatGPT |
| Cursor | `cursor-agent` | `make demo-cursor` | `CURSOR_API_KEY` |
| Antigravity | `agy` | `make demo-agy` | tu cuenta de Google |

Para el navegador los cuatro son idénticos: se conecta al mismo WebSocket. Lo
único que cambia es qué perfil corre el harness del otro lado.

La sesión grabada va primero y preseleccionada: quien llega sin key tiene que
ver algo funcionando en un clic. **Las API keys nunca se guardan** — viven en
`sessionStorage` y se van al cerrar la pestaña. El proveedor elegido sí se
recuerda.

El navegador no puede ejecutar un CLI: para la opción *CLI local* corres el
harness en tu máquina y esta página se conecta por WebSocket.

```bash
cd legacy && make demo-code     # luego pon ws://127.0.0.1:8080 en el gate
```

> Los perfiles `codex` y `cursor` se agregaron después del hackatón y sus flags
> salieron de documentación oficial, no de correr los binarios. Si alguno falla,
> el error trae el `argv` completo y se corrige con `CLI_BINARY` /
> `CLI_EXTRA_ARGS` sin tocar código.

> Usa `127.0.0.1`, no `localhost`: Chrome bloquea `ws://localhost` desde una
> página HTTPS como mixed content, y la IP de loopback sí pasa.

---

## Contrato compartido

El Python manda; el navegador consume artefactos generados. Nada se copia a
mano entre los dos targets.

```bash
make contract         # regenera desde el harness de legacy/
make contract-check   # falla si lo commiteado quedó viejo (esto corre en CI)
```

Emite `web/public/contract/` (catálogo de 19 componentes, 6 herramientas y sus
esquemas) y `web/tests/goldens/` (28 casos entrada→salida calculados por el
Python, con bordes: cero, plazos largos, tasas absurdas).

Dos mecanismos impiden que las implementaciones se separen:

1. **CI regenera y compara.** Si hay diferencia, el build falla pidiendo
   `make contract`.
2. **`make web-test`** corre cada golden contra la implementación TS de la
   herramienta, con tolerancia relativa `1e-9` — nunca igualdad de floats.

Sin estos dos, las dos versiones del dominio dicen cosas distintas en semanas.
Son la razón por la que duplicar el ciclo es aceptable.

---

## Estructura

```
web/                  demo permanente (GitHub Pages)
  public/contract/      GENERADO — catálogo y herramientas
  public/recorded/      GENERADO — sesiones grabadas
  src/engine/           TurnEngine: recorded | browser | remote
  src/provider/         adaptadores Anthropic y Gemini
  src/agent/tools/      las 6 herramientas en TS
  src/a2ui/             renderer A2UI + gráficas ECharts
  tests/goldens/        GENERADO — paridad con el Python
scripts/              exportadores del contrato (corren en build, no en runtime)
legacy/               el proyecto del hackatón, congelado
```

## Stack

**web/** React 19 · Vite · TypeScript · ECharts · CSS propio (sin framework) ·
diseño liquid glass · mascota SVG animada.

**legacy/** Python 3.11+ · FastAPI · MCP · A2UI v0.9.1 · Docker.

Los datos son **sintéticos**. Esto no es asesoría financiera.
