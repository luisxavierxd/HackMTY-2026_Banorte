# ── etapa 1: build del frontend ──
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── etapa 2: imagen de producción ──
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Node.js 20 LTS — necesario para el CLI de Claude Code (proveedor claude_code).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

# gosu: para bajar de root a `app` en el entrypoint DESPUÉS de arreglar
# permisos de volúmenes montados en runtime (ver entrypoint.sh).
RUN set -eux; \
    curl -fsSL -o /usr/local/bin/gosu \
      "https://github.com/tianon/gosu/releases/download/1.17/gosu-$(dpkg --print-architecture)" && \
    chmod +x /usr/local/bin/gosu && \
    gosu --version

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install \
      "fastapi>=0.115" "uvicorn[standard]>=0.32" "pydantic>=2.9" \
      "google-genai>=1.0" "anthropic>=0.40" "mcp>=1.9" "httpx>=0.27" "redis>=5.0"

COPY src ./src
COPY mcp_servers ./mcp_servers
COPY --from=web /web/dist ./static
ENV PYTHONPATH=/app/src:/app

RUN useradd -m app && mkdir -p /app/data && chown -R app /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# NOTA: ya no hay `USER app` fijo aquí a propósito. El contenedor arranca
# como root para que el entrypoint pueda arreglar permisos de volúmenes
# montados en runtime (/home/app/.claude, /app/data) y luego bajar a `app`
# con gosu antes de ejecutar el CMD real. Ver entrypoint.sh.

# Railway inyecta PORT; fallback a 8080 para docker compose local.
ENV PORT=8080
EXPOSE ${PORT}
HEALTHCHECK --interval=20s --timeout=3s --start-period=15s \
  CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",8080)}/healthz',timeout=2).status==200 else 1)"
ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "uvicorn harness.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
