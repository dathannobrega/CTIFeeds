"""Feed aggregation service."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

import logging
import requests

from ..config import FeedConfig
from ..repositories import ExclusionRepository
from .validators import normalise_indicator

LOGGER = logging.getLogger(__name__)


@dataclass
class AggregatedFeed:
    """Container holding aggregated feed data per indicator type."""

    urls: List[str]
    domains: List[str]
    ipv4: List[str]


class FeedAggregator:
    """Service responsible for downloading, normalising and caching feeds."""

    def __init__(self, feed_config: FeedConfig, cache_dir: Path) -> None:
        self._feed_config = feed_config
        self._cache_dir = cache_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def refresh(self, repository: ExclusionRepository) -> AggregatedFeed:
        """Fetch feeds, remove exclusions, persist caches and return data."""
        raw_data = self._fetch_feeds()
        filtered = self._apply_exclusions(raw_data, repository)
        self._write_cache(filtered)
        return filtered

    def _fetch_feeds(self) -> AggregatedFeed:
        urls = self._collect_items(self._feed_config.urls, "url")
        domains = self._collect_items(self._feed_config.domains, "domain")
        ipv4 = self._collect_items(self._feed_config.ipv4, "ipv4")
        return AggregatedFeed(urls=sorted(urls), domains=sorted(domains), ipv4=sorted(ipv4))

    def _collect_items(self, sources: Iterable[str], indicator_type: str) -> set[str]:
        collected: set[str] = set()
        for source in sources:
            try:
                response = requests.get(source, timeout=30)
                response.raise_for_status()
            except requests.RequestException as error:
                LOGGER.warning("Failed to fetch %s feed %s: %s", indicator_type, source, error)
                continue
            for line in response.text.splitlines():
                item = self._normalise_value(line, indicator_type)
                if item:
                    collected.add(item)
        return collected

    def _normalise_value(self, value: str, indicator_type: str) -> str | None:
        cleaned = value.strip()
        if not cleaned or cleaned.startswith("#"):
            return None
        normalised = normalise_indicator(indicator_type, cleaned)
        if normalised is None:
            LOGGER.debug("Skipping invalid %s value %s", indicator_type, cleaned)
        return normalised

    def _apply_exclusions(
        self, aggregated: AggregatedFeed, repository: ExclusionRepository
    ) -> AggregatedFeed:
        exclusions = {
            "urls": repository.list_values_by_type("url"),
            "domains": repository.list_values_by_type("domain"),
            "ipv4": repository.list_values_by_type("ipv4"),
        }
        return AggregatedFeed(
            urls=sorted(set(aggregated.urls) - exclusions["urls"]),
            domains=sorted(set(aggregated.domains) - exclusions["domains"]),
            ipv4=sorted(set(aggregated.ipv4) - exclusions["ipv4"]),
        )

    def _write_cache(self, aggregated: AggregatedFeed) -> None:
        mapping: Dict[str, Iterable[str]] = {
            "urls.txt": aggregated.urls,
            "domains.txt": aggregated.domains,
            "ipv4.txt": aggregated.ipv4,
        }
        for filename, items in mapping.items():
            path = self._cache_dir / filename
            path.write_text("\n".join(items), encoding="utf-8")
