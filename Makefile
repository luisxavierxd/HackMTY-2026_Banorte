# Banky — dos targets, un repo.
#
#   web/      demo permanente en GitHub Pages, sin backend. Es lo que se
#             despliega y lo que ve quien abre el link del portafolio.
#   legacy/   el proyecto del hackatón, congelado y funcionando. Tiene su
#             propio Makefile: `cd legacy && make demo`.
#
# Lo único que cruza de legacy/ a web/ son artefactos generados en build
# (`make contract`). En runtime el navegador no sabe que legacy/ existe.
.PHONY: help contract contract-check web web-install web-dev web-build web-test legacy-test

help:
	@echo "contract       regenera catalog/tools/goldens desde el harness Python"
	@echo "contract-check falla si lo commiteado difiere de lo generado (lo que corre CI)"
	@echo "web            contract + build de producción"
	@echo "web-dev        servidor de desarrollo de la demo"
	@echo "web-test       goldens TS vs Python"
	@echo "legacy-test    los 94 tests del harness del hackatón"

# --- contrato compartido (§3 de la spec) ---
contract:
	python scripts/export_contract.py
	python scripts/export_tool_goldens.py

contract-check:
	python scripts/export_contract.py --check
	python scripts/export_tool_goldens.py --check

# --- target Pages ---
web-install: ; cd web && npm ci
web-dev:     ; cd web && npm run dev
web-build:   ; cd web && npm run build
web-test:    ; cd web && npm run test
web: contract web-build

# --- target congelado ---
legacy-test: ; cd legacy && python -m pytest -q
