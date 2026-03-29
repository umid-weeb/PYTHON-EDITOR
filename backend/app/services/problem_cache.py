"""
ProblemCache — pure in-memory LRU cache.

Replaces the old file-based (.cache/problems/*.json) implementation.
Reasons:
  - File caching caused stale test-case data to persist across deploys.
  - At 3500+ problems, thousands of JSON files would accumulate on disk.
  - Supabase (PostgreSQL) is the single source of truth; data should never
    be persisted to a secondary local store.
  - On Render (ephemeral filesystem), file caching provided no benefit
    across server restarts anyway.

The in-memory LRU cache is per-process and is invalidated on restart,
which is exactly what we want: fresh data from the DB every deploy.
"""
from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any


class _LRUDict(OrderedDict):
    """Simple LRU container with a max-size limit."""

    def __init__(self, maxsize: int = 512) -> None:
        super().__init__()
        self.maxsize = maxsize

    def __setitem__(self, key: object, value: object) -> None:
        if key in self:
            self.move_to_end(key)
        super().__setitem__(key, value)
        if len(self) > self.maxsize:
            self.popitem(last=False)

    def get_fresh(self, key: object, ttl: float) -> object | None:
        """Return value only if it was stored within *ttl* seconds, else None."""
        entry = super().get(key)
        if entry is None:
            return None
        stored_at, payload = entry
        if time.monotonic() - stored_at > ttl:
            return None
        self.move_to_end(key)
        return payload

    def set_entry(self, key: object, payload: object) -> None:
        self[key] = (time.monotonic(), payload)


class ProblemCache:
    """
    In-memory problem cache that sits in front of Supabase.

    All data lives in RAM only — never written to disk.
    TTL defaults to 5 minutes (same as the old file-cache default).
    """

    def __init__(
        self,
        cache_dir: object = None,   # kept for API compatibility, ignored
        ttl_seconds: int = 300,
        redis_client: object = None,  # optional; used when Redis is configured
    ) -> None:
        self._ttl = max(1, int(ttl_seconds))
        self._store: _LRUDict = _LRUDict(maxsize=1024)
        self.redis = redis_client
        self.hit_count = 0
        self.miss_count = 0

    # ── public interface ──────────────────────────────────────────────────────

    def load_index(self) -> list[dict[str, Any]] | None:
        payload = self._get("__index__")
        if payload is None:
            return None
        return payload.get("items")

    def save_index(self, items: list[dict[str, Any]]) -> None:
        self._set("__index__", {"items": items})

    def load_problem(self, problem_id: str) -> dict[str, Any] | None:
        return self._get(f"problem:{problem_id}")

    def save_problem(self, problem_id: str, payload: dict[str, Any]) -> None:
        self._set(f"problem:{problem_id}", payload)

    def invalidate(self, problem_id: str | None = None) -> None:
        """Remove a single problem or wipe the entire cache."""
        if problem_id is None:
            self._store.clear()
        else:
            self._store.pop(f"problem:{problem_id}", None)
            self._store.pop("__index__", None)

    def status(self) -> dict[str, Any]:
        return {
            "backend": "in-memory LRU",
            "entries": len(self._store),
            "ttl_seconds": self._ttl,
            "hits": self.hit_count,
            "misses": self.miss_count,
        }

    # ── internals ─────────────────────────────────────────────────────────────

    def _get(self, key: str) -> dict[str, Any] | None:
        # Try Redis first (when available)
        if self.redis:
            import json
            try:
                raw = self.redis.get(key)
                if raw:
                    self.hit_count += 1
                    return json.loads(raw)
            except Exception:
                pass  # Redis failure → fall through to in-process cache

        value = self._store.get_fresh(key, self._ttl)
        if value is None:
            self.miss_count += 1
            return None
        self.hit_count += 1
        return value

    def _set(self, key: str, payload: dict[str, Any]) -> None:
        if self.redis:
            import json
            try:
                self.redis.setex(key, self._ttl, json.dumps(payload, ensure_ascii=False))
            except Exception:
                pass  # Redis failure is non-fatal

        self._store.set_entry(key, payload)
