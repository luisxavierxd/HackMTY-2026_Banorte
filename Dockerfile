# Imagen única para harness y servidores MCP: el comando decide el rol.
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install \
      "fastapi>=0.115" "uvicorn[standard]>=0.32" "pydantic>=2.9" \
      "google-genai>=1.0" "anthropic>=0.40" "mcp>=1.9" "httpx>=0.27" "redis>=5.0"

COPY src ./src
COPY mcp_servers ./mcp_servers
ENV PYTHONPATH=/app/src:/app

RUN useradd -m app && mkdir -p /app/data && chown -R app /app
USER app

EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=15s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz',timeout=2).status==200 else 1)"
CMD ["uvicorn", "harness.app:app", "--host", "0.0.0.0", "--port", "8080"]
