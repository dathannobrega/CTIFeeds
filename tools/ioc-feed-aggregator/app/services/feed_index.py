"""Leitura em memória dos feeds publicados, para consultas e amostras rápidas."""
from __future__ import annotations

import random
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

from .feed_service import FEED_FILES


@dataclass(frozen=True)
class _Snapshot:
    key: Tuple[int, int, int]
    values: frozenset[str]
    ordered: List[str]


class FeedIndex:
    """Mantém um conjunto por tipo de indicador, recarregado quando o arquivo muda.

    A publicação troca os arquivos por ``os.replace``; mudança de inode, tamanho ou
    mtime invalida o snapshot em memória.
    """

    def __init__(self, cache_dir: Path) -> None:
        self._cache_dir = cache_dir
        self._lock = threading.Lock()
        self._snapshots: Dict[str, _Snapshot] = {}

    def _snapshot(self, indicator_type: str) -> _Snapshot:
        path = self._cache_dir / FEED_FILES[indicator_type]
        try:
            stat = path.stat()
        except FileNotFoundError:
            return _Snapshot((0, 0, 0), frozenset(), [])
        key = (stat.st_ino, stat.st_size, stat.st_mtime_ns)
        with self._lock:
            current = self._snapshots.get(indicator_type)
            if current is not None and current.key == key:
                return current
            ordered = [line for line in path.read_text(encoding="utf-8").splitlines() if line]
            snapshot = _Snapshot(key, frozenset(ordered), ordered)
            self._snapshots[indicator_type] = snapshot
            return snapshot

    def contains(self, indicator_type: str, value: str) -> bool:
        return value in self._snapshot(indicator_type).values

    def count(self, indicator_type: str) -> int:
        return len(self._snapshot(indicator_type).ordered)

    def sample(self, indicator_type: str, size: int) -> List[str]:
        ordered = self._snapshot(indicator_type).ordered
        if len(ordered) <= size:
            return list(ordered)
        return random.sample(ordered, size)
