#!/usr/bin/env python3
"""Corre un turno completo contra el harness y valida la salida A2UI.

    python scripts/smoke_turn.py "Quiero pagar menos intereses de mi tarjeta"
"""
import json, sys, urllib.request

BASE = "http://localhost:8080"
text = sys.argv[1] if len(sys.argv) > 1 else "Quiero pagar menos intereses de mi tarjeta"
body = json.dumps({"session_id": "smoke", "type": "user_message", "text": text}).encode()
req = urllib.request.Request(f"{BASE}/v1/turn", body, {"Content-Type": "application/json"})

with urllib.request.urlopen(req, timeout=120) as resp:
    for raw in resp:
        line = raw.decode().strip()
        if not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload == "[DONE]":
            break
        ev = json.loads(payload)
        if ev["type"] == "surface":
            print(f"\nUI: {ev['title']} — {ev['summary']}")
            for msg in ev["a2ui"]:
                print("  envelope:", next(k for k in msg if k != "version"))
            comps = [m for m in ev["a2ui"] if "updateComponents" in m]
            if comps:
                for c in comps[0]["updateComponents"]["components"]:
                    print(f"   - {c['id']}: {c['component']}")
            if ev["warnings"]:
                print("  warnings:", ev["warnings"])
        else:
            print(json.dumps(ev, ensure_ascii=False)[:160])
