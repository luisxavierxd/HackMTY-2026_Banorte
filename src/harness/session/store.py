"""Estado de sesión: historia del modelo + data model de la superficie.

Dos backends detrás de la misma interfaz:
  - memory: 1 proceso, cero infra. Suficiente para la demo.
  - redis : N réplicas detrás de un load balancer. Mismo código.
Cambiar de uno a otro es una variable de entorno, no un refactor.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class Session:
    session_id: str
    domain: str
    history: list[dict] = field(default_factory=list)
    data_model: dict = field(default_factory=dict)
    rendered: bool = False
    created_at: float = field(default_factory=time.time)

    def to_json(self) -> str:
        return json.dumps(
            {
                "session_id": self.session_id,
                "domain": self.domain,
                "history": self.history,
                "data_model": self.data_model,
                "rendered": self.rendered,
                "created_at": self.created_at,
            }
        )

    @staticmethod
    def from_json(raw: str) -> "Session":
        return Session(**json.loads(raw))

    def trim(self, max_turns: int) -> None:
        if len(self.history) > max_turns * 2:
            self.history = self.history[-max_turns * 2 :]


class SessionStore(Protocol):
    async def get(self, session_id: str, domain: str) -> Session: ...
    async def put(self, session: Session) -> None: ...
    async def drop(self, session_id: str) -> None: ...


class MemoryStore:
    def __init__(self, ttl_s: int = 3600):
        self._data: dict[str, tuple[float, Session]] = {}
        self.ttl = ttl_s

    async def get(self, session_id: str, domain: str) -> Session:
        self._gc()
        entry = self._data.get(session_id)
        if entry:
            return entry[1]
        session = Session(session_id=session_id, domain=domain)
        self._data[session_id] = (time.time(), session)
        return session

    async def put(self, session: Session) -> None:
        self._data[session.session_id] = (time.time(), session)

    async def drop(self, session_id: str) -> None:
        self._data.pop(session_id, None)

    def _gc(self) -> None:
        cutoff = time.time() - self.ttl
        for key in [k for k, (ts, _) in self._data.items() if ts < cutoff]:
            self._data.pop(key, None)


class RedisStore:
    def __init__(self, url: str, ttl_s: int = 3600):
        import redis.asyncio as redis  # dependencia opcional

        self.r = redis.from_url(url, decode_responses=True)
        self.ttl = ttl_s

    def _key(self, sid: str) -> str:
        return f"genui:session:{sid}"

    async def get(self, session_id: str, domain: str) -> Session:
        raw = await self.r.get(self._key(session_id))
        return Session.from_json(raw) if raw else Session(session_id=session_id, domain=domain)

    async def put(self, session: Session) -> None:
        await self.r.set(self._key(session.session_id), session.to_json(), ex=self.ttl)

    async def drop(self, session_id: str) -> None:
        await self.r.delete(self._key(session_id))


def build_store(backend: str, redis_url: str, ttl_s: int) -> Any:
    if backend == "redis" and redis_url:
        return RedisStore(redis_url, ttl_s)
    return MemoryStore(ttl_s)
