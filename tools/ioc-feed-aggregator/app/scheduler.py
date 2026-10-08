"""Coleta periódica dos feeds dentro do próprio processo web.

Cada worker do gunicorn inicia uma thread, mas só a que conseguir o ``flock`` de
``.scheduler.lock`` coleta (eleição de líder entre processos). Se o líder morrer,
o sistema operacional solta a trava e outro worker assume na próxima tentativa.
"""
from __future__ import annotations

import fcntl
import logging
import threading
from datetime import datetime, timezone
from typing import IO

from .database import session_scope
from .repositories import ExclusionRepository
from .services.feed_service import FeedAggregator

LOGGER = logging.getLogger(__name__)

LOCK_FILE = ".scheduler.lock"


class RefreshScheduler(threading.Thread):
    """Thread daemon que chama ``FeedAggregator.refresh`` a cada ``interval`` segundos."""

    def __init__(
        self, aggregator: FeedAggregator, interval: int, retry: int = 60, initial_delay: float = 5
    ) -> None:
        super().__init__(name="feed-refresh", daemon=True)
        self._aggregator = aggregator
        self._interval = interval
        self._retry = retry
        self._initial_delay = initial_delay
        self._stop_event = threading.Event()
        self._lock_handle: IO[str] | None = None

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        # Pequeno atraso: comandos de CLI (flask refresh-feeds) param a thread antes que ela colete.
        self._stop_event.wait(self._initial_delay)
        while not self._stop_event.is_set():
            if not self._is_leader():
                self._stop_event.wait(self._retry)
                continue
            wait = self._seconds_until_due()
            if wait > 0:
                self._stop_event.wait(min(wait, self._interval))
                continue
            self._refresh()

    def _is_leader(self) -> bool:
        if self._lock_handle is not None:
            return True
        handle = open(self._aggregator.cache_dir / LOCK_FILE, "a", encoding="utf-8")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            return False
        self._lock_handle = handle
        LOGGER.info("Feed refresh scheduler active (every %ss)", self._interval)
        return True

    def _seconds_until_due(self) -> float:
        collected_at = self._aggregator.read_state().get("collected_at")
        if not collected_at:
            return 0
        try:
            last = datetime.fromisoformat(collected_at.replace("Z", "+00:00"))
        except ValueError:
            return 0
        elapsed = (datetime.now(timezone.utc) - last).total_seconds()
        return self._interval - elapsed

    def _refresh(self) -> None:
        try:
            with session_scope() as session:
                feed = self._aggregator.refresh(ExclusionRepository(session))
            LOGGER.info(
                "Feeds refreshed: %d urls, %d domains, %d ipv4",
                len(feed.urls),
                len(feed.domains),
                len(feed.ipv4),
            )
        except Exception:  # pragma: no cover - defensive logging
            LOGGER.exception("Scheduled feed refresh failed")
            # Evita laço apertado se o banco estiver fora do ar.
            self._stop_event.wait(self._retry)
