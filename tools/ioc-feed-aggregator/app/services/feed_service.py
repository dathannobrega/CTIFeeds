"""Feed aggregation service."""
from __future__ import annotations

import fcntl
import hashlib
import json
import logging
import os
import tempfile
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Iterator, List

import requests

from ..config import FeedConfig
from ..repositories import ExclusionRepository
from .validators import INDICATOR_TYPES, normalise_indicator

LOGGER = logging.getLogger(__name__)

FEED_FILES: Dict[str, str] = {"url": "urls.txt", "domain": "domains.txt", "ipv4": "ipv4.txt"}
CHECKSUMS_FILE = "SHA256SUMS"
STATE_FILE = "state.json"
RAW_DIR = "raw"
PUBLISH_LOCK = ".publish.lock"
USER_AGENT = "ioc-feed-aggregator/2.0 (+https://github.com/dathannobrega/CTIFeeds)"

Downloader = Callable[[str], str]


def utc_now() -> str:
    """Timestamp ISO 8601 em UTC, com sufixo ``Z``."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass
class AggregatedFeed:
    """Container holding aggregated feed data per indicator type."""

    urls: List[str]
    domains: List[str]
    ipv4: List[str]

    @classmethod
    def from_types(cls, mapping: Dict[str, Iterable[str]]) -> "AggregatedFeed":
        return cls(
            urls=sorted(mapping.get("url", ())),
            domains=sorted(mapping.get("domain", ())),
            ipv4=sorted(mapping.get("ipv4", ())),
        )


@dataclass
class SourceReport:
    """Resultado da última coleta de uma fonte."""

    indicator_type: str
    url: str
    ok: bool
    count: int = 0
    invalid: int = 0
    duration_ms: int = 0
    stale: bool = False
    error: str | None = None
    fetched_at: str = ""


class FeedTooLargeError(RuntimeError):
    """A fonte excedeu o tamanho máximo configurado."""


class FeedAggregator:
    """Service responsible for downloading, normalising and caching feeds.

    Cada fonte tem sua última coleta válida guardada em ``raw/``. Se uma fonte falhar,
    a cópia anterior continua valendo (marcada como ``stale``), para que a blocklist
    publicada não encolha de repente por uma indisponibilidade temporária.
    """

    def __init__(
        self,
        feed_config: FeedConfig,
        cache_dir: Path,
        *,
        downloader: Downloader | None = None,
        timeout: float = 30,
        max_bytes: int = 64 * 1024 * 1024,
    ) -> None:
        self._feed_config = feed_config
        self._cache_dir = cache_dir
        self._raw_dir = cache_dir / RAW_DIR
        self._raw_dir.mkdir(parents=True, exist_ok=True)
        self._timeout = timeout
        self._max_bytes = max_bytes
        self._download = downloader or self._http_download

    @property
    def cache_dir(self) -> Path:
        return self._cache_dir

    def sources(self) -> list[tuple[str, str]]:
        """Lista ``(tipo, url)`` de todas as fontes configuradas."""
        return [
            *(("url", source) for source in self._feed_config.urls),
            *(("domain", source) for source in self._feed_config.domains),
            *(("ipv4", source) for source in self._feed_config.ipv4),
        ]

    def refresh(self, repository: ExclusionRepository) -> AggregatedFeed:
        """Fetch feeds, remove exclusions, persist caches and return data."""
        collected_at = utc_now()
        raw: Dict[str, set[str]] = {kind: set() for kind in INDICATOR_TYPES}
        reports: list[SourceReport] = []
        for indicator_type, source in self.sources():
            items, report = self._collect_source(indicator_type, source)
            raw[indicator_type] |= items
            reports.append(report)
        self._prune_raw()
        with self._publish_lock():
            return self._publish(raw, repository, reports=reports, collected_at=collected_at)

    def publish(self, repository: ExclusionRepository) -> AggregatedFeed:
        """Reaplica a lista de exclusão sobre a última coleta, sem baixar as fontes de novo."""
        if not self._has_raw():
            return self.refresh(repository)
        with self._publish_lock():
            return self._publish(self._read_raw(), repository)

    def read_state(self) -> Dict[str, Any]:
        """Metadados da última coleta/publicação (``{}`` se ainda não houver)."""
        try:
            return json.loads((self._cache_dir / STATE_FILE).read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    # Coleta -----------------------------------------------------------------

    def _collect_source(self, indicator_type: str, source: str) -> tuple[set[str], SourceReport]:
        started = time.monotonic()
        report = SourceReport(indicator_type=indicator_type, url=source, ok=False, fetched_at=utc_now())
        try:
            text = self._download(source)
        except (requests.RequestException, FeedTooLargeError) as error:
            LOGGER.warning("Failed to fetch %s feed %s: %s", indicator_type, source, error)
            report.error = _short_error(error)
            report.duration_ms = int((time.monotonic() - started) * 1000)
            cached = self._read_source_cache(indicator_type, source)
            if cached is not None:
                report.stale = True
                report.count = len(cached)
                return cached, report
            return set(), report

        items: set[str] = set()
        for line in text.splitlines():
            cleaned = line.strip()
            if not cleaned or cleaned.startswith("#"):
                continue
            item = self._normalise_value(cleaned, indicator_type)
            if item:
                items.add(item)
            else:
                report.invalid += 1
        report.ok = True
        report.count = len(items)
        report.duration_ms = int((time.monotonic() - started) * 1000)
        self._write_source_cache(indicator_type, source, items)
        return items, report

    def _http_download(self, source: str) -> str:
        with requests.get(
            source, timeout=self._timeout, stream=True, headers={"User-Agent": USER_AGENT}
        ) as response:
            response.raise_for_status()
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_content(chunk_size=65536):
                size += len(chunk)
                if size > self._max_bytes:
                    raise FeedTooLargeError(f"response larger than {self._max_bytes} bytes")
                chunks.append(chunk)
            encoding = response.encoding or "utf-8"
        return b"".join(chunks).decode(encoding, errors="replace")

    def _normalise_value(self, value: str, indicator_type: str) -> str | None:
        normalised = normalise_indicator(indicator_type, value)
        if normalised is None:
            LOGGER.debug("Skipping invalid %s value %s", indicator_type, value)
        return normalised

    # Cache bruto por fonte ---------------------------------------------------

    def _source_cache_path(self, indicator_type: str, source: str) -> Path:
        digest = hashlib.sha256(f"{indicator_type}\n{source}".encode("utf-8")).hexdigest()[:24]
        return self._raw_dir / f"{indicator_type}-{digest}.txt"

    def _write_source_cache(self, indicator_type: str, source: str, items: set[str]) -> None:
        _atomic_write(self._source_cache_path(indicator_type, source), _lines(sorted(items)))

    def _read_source_cache(self, indicator_type: str, source: str) -> set[str] | None:
        try:
            text = self._source_cache_path(indicator_type, source).read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        return {line for line in text.splitlines() if line}

    def _has_raw(self) -> bool:
        return any(
            self._source_cache_path(kind, source).exists() for kind, source in self.sources()
        )

    def _read_raw(self) -> Dict[str, set[str]]:
        raw: Dict[str, set[str]] = {kind: set() for kind in INDICATOR_TYPES}
        for indicator_type, source in self.sources():
            raw[indicator_type] |= self._read_source_cache(indicator_type, source) or set()
        return raw

    def _prune_raw(self) -> None:
        """Remove caches de fontes que saíram da configuração."""
        expected = {self._source_cache_path(kind, source).name for kind, source in self.sources()}
        for path in self._raw_dir.glob("*.txt"):
            if path.name not in expected:
                path.unlink(missing_ok=True)

    # Publicação --------------------------------------------------------------

    @contextmanager
    def _publish_lock(self) -> Iterator[None]:
        """Serializa publicações entre processos (workers do gunicorn)."""
        with open(self._cache_dir / PUBLISH_LOCK, "a", encoding="utf-8") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def _publish(
        self,
        raw: Dict[str, set[str]],
        repository: ExclusionRepository,
        *,
        reports: list[SourceReport] | None = None,
        collected_at: str | None = None,
    ) -> AggregatedFeed:
        published: Dict[str, list[str]] = {}
        feeds_meta: Dict[str, Dict[str, Any]] = {}
        for indicator_type in INDICATOR_TYPES:
            excluded = repository.list_values_by_type(indicator_type)
            items = sorted(raw[indicator_type] - excluded)
            data = _lines(items)
            filename = FEED_FILES[indicator_type]
            _atomic_write(self._cache_dir / filename, data)
            published[indicator_type] = items
            feeds_meta[indicator_type] = {
                "file": filename,
                "count": len(items),
                "raw_count": len(raw[indicator_type]),
                "excluded": len(raw[indicator_type]) - len(items),
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }

        checksums = "".join(f"{meta['sha256']}  {meta['file']}\n" for meta in feeds_meta.values())
        _atomic_write(self._cache_dir / CHECKSUMS_FILE, checksums.encode("utf-8"))

        state = self.read_state()
        state["published_at"] = utc_now()
        state["feeds"] = feeds_meta
        if reports is not None:
            state["collected_at"] = collected_at
            state["sources"] = [asdict(report) for report in reports]
        _atomic_write(self._cache_dir / STATE_FILE, json.dumps(state, indent=2).encode("utf-8"))
        return AggregatedFeed.from_types(published)


def _lines(items: list[str]) -> bytes:
    """Um indicador por linha, com quebra de linha final (``wc -l`` e ``while read`` agradecem)."""
    return ("\n".join(items) + "\n").encode("utf-8") if items else b""


def _atomic_write(path: Path, data: bytes) -> None:
    """Grava num temporário e renomeia: leitores (nginx, outros workers) nunca veem arquivo pela metade."""
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        # O nginx (outro usuário, outro container) precisa ler os arquivos publicados.
        os.chmod(tmp_name, 0o644)
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def _short_error(error: Exception) -> str:
    """Mensagem curta e sem a URL completa (que pode conter credenciais na query string)."""
    if isinstance(error, requests.HTTPError) and error.response is not None:
        return f"HTTP {error.response.status_code}"
    if isinstance(error, requests.Timeout):
        return "timeout"
    if isinstance(error, requests.ConnectionError):
        return "connection error"
    if isinstance(error, FeedTooLargeError):
        return "response too large"
    return type(error).__name__
