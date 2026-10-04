"""Application configuration helpers."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import os
import yaml


@dataclass(frozen=True)
class FeedConfig:
    """Configuration for external feed sources grouped by indicator type."""

    urls: List[str]
    domains: List[str]
    ipv4: List[str]

    @classmethod
    def from_mapping(cls, data: Dict[str, List[str]]) -> "FeedConfig":
        """Create configuration from a mapping loaded from YAML."""
        urls = [item.strip() for item in data.get("urls", []) if item]
        domains = [item.strip() for item in data.get("domains", []) if item]
        ipv4 = [item.strip() for item in data.get("ipv4", []) if item]
        return cls(urls=urls, domains=domains, ipv4=ipv4)


@dataclass(frozen=True)
class AppConfig:
    """Application level configuration."""

    feed_config: FeedConfig


def load_app_config(config_path: Path | None = None) -> AppConfig:
    """Load the configuration from a YAML file."""
    if config_path is not None:
        path = config_path
    else:
        env_path = os.getenv("FEED_CONFIG_PATH")
        path = Path(env_path) if env_path else Path("config/feeds.yaml")
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    feed_config = FeedConfig.from_mapping(data)
    return AppConfig(feed_config=feed_config)
