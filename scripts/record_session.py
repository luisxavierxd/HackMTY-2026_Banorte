#!/usr/bin/env python3
"""Graba turnos reales del harness para que la demo corra sin credencial.

Corre cada prompt contra un harness vivo (`cd legacy && make demo-code`),
cronometra los eventos que salen del stream SSE y los guarda con la forma que
espera `RecordedEngine` — el contrato está en `web/src/engine/recordedFormat.ts`.

Grabar en vez de simular es el punto: las respuestas son del harness real, con
el modelo real y las tools reales. Quien llega sin API key ve la demo de
verdad, no un mockup escrito a mano.

    cd legacy && make demo-code          # en otra terminal
    python scripts/record_session.py     # graba los 6 prompts por defecto
    python scripts/record_session.py --prompt "¿Qué es el CAT?" --id cat
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web" / "public" / "recorded"

#: debe coincidir con RECORDED_FORMAT_VERSION en recordedFormat.ts
FORMAT_VERSION = 1

#: eventos que el motor no reproduce: el heartbeat es ruido de transporte y
#: `ready` lo emite el propio motor al conectar.
SKIP_EVENTS = {"heartbeat", "ready"}

#: un prompt por herramienta del dominio, para que casi cualquier pregunta
#: razonable encuentre una grabación parecida.
DEFAULT_PROMPTS: list[tuple[str, str]] = [
    ("interes_compuesto", "¿Cómo crece mi deuda con interés compuesto?"),
    ("pago_minimo_vs_fijo", "Quiero pagar menos intereses en mi tarjeta"),
    ("meta_ahorro", "Ayúdame a planear una meta de ahorro"),
    ("cat", "¿Qué es el CAT y por qué es más alto que la tasa?"),
    ("inflacion", "¿Cómo me afecta la inflación si no invierto?"),
    ("regla_50_30_20", "¿Cómo voy con mis gastos este mes?"),
]


def _record_turn(base: str, session_id: str, prompt: str, timeout: int) -> dict[str, Any]:
    """Corre un turno por SSE y devuelve los eventos con sus deltas."""
    body = json.dumps(
        {"session_id": session_id, "type": "user_message", "text": prompt}
    ).encode()
    req = urllib.request.Request(
        f"{base}/v1/turn", body, {"Content-Type": "application/json"}
    )

    events: list[dict[str, Any]] = []
    title, provider, model = "", "", ""
    last = time.perf_counter()

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            line = raw.decode("utf-8").strip()
            if not line.startswith("data: "):
                continue
            payload = line[6:]
            if payload == "[DONE]":
                break
            event = json.loads(payload)
            if event.get("type") in SKIP_EVENTS:
                continue

            now = time.perf_counter()
            events.append({"deltaMs": round((now - last) * 1000), "event": event})
            last = now

            if event["type"] == "surface":
                title = event.get("title") or title
            elif event["type"] == "turn_end":
                provider = event.get("provider") or provider
                model = event.get("model") or model

    if not events:
        raise RuntimeError("el turno no produjo eventos")
    return {"events": events, "title": title, "provider": provider, "model": model}


def _dump(doc: Any) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8080",
                    help="URL del harness vivo (default: %(default)s)")
    ap.add_argument("--prompt", help="graba un solo prompt en vez de los 6 por defecto")
    ap.add_argument("--id", help="id del archivo cuando se usa --prompt")
    ap.add_argument("--timeout", type=int, default=300,
                    help="segundos por turno; el CLI puede tardar minutos")
    args = ap.parse_args()

    if args.prompt and not args.id:
        print("--prompt requiere --id", file=sys.stderr)
        return 1

    jobs = [(args.id, args.prompt)] if args.prompt else DEFAULT_PROMPTS

    try:
        with urllib.request.urlopen(f"{args.base}/healthz", timeout=5):
            pass
    except (urllib.error.URLError, OSError) as exc:
        print(
            f"no hay harness en {args.base} ({exc}).\n"
            "Levántalo con:  cd legacy && make demo-code",
            file=sys.stderr,
        )
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index: list[dict[str, Any]] = []
    failed: list[str] = []

    for job_id, prompt in jobs:
        print(f"grabando {job_id}: {prompt!r} …", flush=True)
        try:
            rec = _record_turn(args.base, f"rec-{job_id}", prompt, args.timeout)
        except Exception as exc:
            print(f"  falló: {type(exc).__name__}: {exc}", file=sys.stderr)
            failed.append(job_id)
            continue

        session = {
            "id": job_id,
            "prompt": prompt,
            "title": rec["title"],
            "kind": "message",
            "provider": rec["provider"],
            "model": rec["model"],
            "recordedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "events": rec["events"],
        }
        (OUT_DIR / f"{job_id}.json").write_text(_dump(session), encoding="utf-8")
        index.append({
            "file": f"{job_id}.json",
            "id": job_id,
            "prompt": prompt,
            "title": rec["title"],
            "kind": "message",
        })
        print(f"  {len(rec['events'])} eventos · {rec['title']!r}")

    if not index:
        print("no se grabó ninguna sesión", file=sys.stderr)
        return 1

    # Se re-escribe completo a propósito: el índice refleja lo que hay en la
    # carpeta ahora, no un acumulado de corridas viejas que ya no existen.
    if args.prompt:
        existing = OUT_DIR / "index.json"
        if existing.exists():
            prev = json.loads(existing.read_text(encoding="utf-8")).get("sessions", [])
            keep = [s for s in prev if s.get("id") != args.id]
            index = keep + index

    (OUT_DIR / "index.json").write_text(
        _dump({"version": FORMAT_VERSION, "sessions": index}), encoding="utf-8"
    )
    print(f"\níndice con {len(index)} sesiones en {OUT_DIR.relative_to(ROOT)}")
    if failed:
        print(f"fallaron: {', '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
