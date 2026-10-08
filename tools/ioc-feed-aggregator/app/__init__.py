"""Flask application factory."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Mapping

import click
from flask import Flask

from .api import register_routes
from .config import AppConfig, load_app_config
from .database import init_db, session_scope
from .repositories import ExclusionRepository
from .scheduler import RefreshScheduler
from .services.feed_index import FeedIndex
from .services.feed_service import FeedAggregator

LOGGER = logging.getLogger(__name__)


def create_app(
    config: Mapping[str, Any] | None = None,
    aggregator: FeedAggregator | None = None,
) -> Flask:
    """Application factory used by the Flask CLI and WSGI servers."""
    logging.basicConfig(level=logging.INFO)

    app = Flask(__name__)
    app.json.sort_keys = False  # type: ignore[attr-defined]
    app.config.update(
        ADMIN_TOKEN=os.getenv("ADMIN_TOKEN", "").strip(),
        REFRESH_INTERVAL_SECONDS=_int_env("REFRESH_INTERVAL_SECONDS", 3600),
        MAX_CONTENT_LENGTH=1024 * 1024,
    )
    if config:
        app.config.update(config)

    app_config = load_app_config()
    aggregator = aggregator or _build_aggregator(app_config)
    app.extensions["feed_aggregator"] = aggregator
    app.extensions["feed_index"] = FeedIndex(aggregator.cache_dir)

    if not app.config["ADMIN_TOKEN"]:
        LOGGER.warning(
            "ADMIN_TOKEN is not set: the exclusion API accepts changes without authentication"
        )

    init_db()
    register_routes(app)
    _register_cli(app, aggregator)

    interval = app.config["REFRESH_INTERVAL_SECONDS"]
    if interval > 0 and not app.testing:
        scheduler = RefreshScheduler(aggregator, interval)
        scheduler.start()
        app.extensions["feed_scheduler"] = scheduler

    return app


def _build_aggregator(app_config: AppConfig) -> FeedAggregator:
    cache_dir = Path(os.getenv("CACHE_DIR", "data"))
    return FeedAggregator(
        app_config.feed_config,
        cache_dir,
        timeout=_int_env("FEED_TIMEOUT_SECONDS", 30),
        max_bytes=_int_env("FEED_MAX_BYTES", 64 * 1024 * 1024),
    )


def _register_cli(app: Flask, aggregator: FeedAggregator) -> None:
    @app.cli.command("refresh-feeds")
    def refresh_feeds() -> None:
        """Baixa todas as fontes agora e publica os feeds."""
        scheduler = app.extensions.get("feed_scheduler")
        if scheduler is not None:
            scheduler.stop()
        with session_scope() as session:
            feed = aggregator.refresh(ExclusionRepository(session))
        click.echo(f"urls={len(feed.urls)} domains={len(feed.domains)} ipv4={len(feed.ipv4)}")


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        LOGGER.warning("Invalid integer for %s; using %s", name, default)
        return default
