.PHONY: install dev demo demo-anthropic demo-code demo-agy test docker deploy-check reset providers
UVICORN = PYTHONPATH=src .venv/bin/python -m uvicorn harness.app:app --port 8080

install:         ; pip install -e ".[dev,redis]"
dev:             ; PYTHONPATH=src uvicorn harness.app:app --reload --port 8080

# Los cuatro perfiles. El proveedor es un flag, no una pantalla de ajustes.
demo:            ; LLM_PROVIDER=gemini      PYTHONPATH=src uvicorn harness.app:app --port 8080
demo-anthropic:  ; LLM_PROVIDER=anthropic   PYTHONPATH=src uvicorn harness.app:app --port 8080
demo-code:       ; LLM_PROVIDER=claude_code PYTHONPATH=src uvicorn harness.app:app --port 8080
demo-agy:        ; LLM_PROVIDER=antigravity PYTHONPATH=src uvicorn harness.app:app --port 8080
demo-offline:    ; LLM_PROVIDER=fake        PYTHONPATH=src uvicorn harness.app:app --port 8080

test:            ; PYTHONPATH=src pytest -q
docker:          ; docker compose up --build
reset:           ; rm -f data/state.json && echo "estado sintetico reiniciado"
deploy-check:    ; curl -fsS localhost:8080/readyz | python -m json.tool
providers:       ; PYTHONPATH=src python -c "from harness.config import PROVIDER_PROFILES as P, DEFAULT_PROFILE as D; [print(('*' if k==D else ' '), k, '->', v['reasoning']['provider'], '/', v['ui']['provider'], '| requiere:', v['needs'] or 'nada') for k,v in P.items()]"
