"""Flask application factory."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Tuple

from flask import Flask, jsonify, request

from .config import AppConfig, load_app_config
from .database import init_db, session_scope
from .repositories import ExclusionRepository
from .services.feed_service import FeedAggregator
from .services.validators import normalise_indicator

LOGGER = logging.getLogger(__name__)


def create_app() -> Flask:
    """Application factory used by the Flask CLI and WSGI servers."""
    logging.basicConfig(level=logging.INFO)

    app = Flask(__name__)
    app_config = load_app_config()
    aggregator = _build_aggregator(app_config)

    init_db()
    _refresh_feeds(aggregator)

    @app.get("/exclusions")
    def list_exclusions():
        with session_scope() as session:
            repository = ExclusionRepository(session)
            exclusions = [item.to_dict() for item in repository.list_all()]
        return jsonify(exclusions)

    @app.post("/exclusions")
    def add_exclusion():
        indicator_type, value = _parse_payload(request.get_json(silent=True))
        if not indicator_type or not value:
            return jsonify({"message": "Invalid payload"}), 400

        normalised = normalise_indicator(indicator_type, value)
        if normalised is None:
            return jsonify({"message": "Value does not match indicator type"}), 400

        with session_scope() as session:
            repository = ExclusionRepository(session)
            try:
                exclusion = repository.add(indicator_type, normalised)
            except ValueError as error:
                return jsonify({"message": str(error)}), 400
        _refresh_feeds(aggregator)
        return jsonify(exclusion.to_dict()), 201

    @app.delete("/exclusions")
    def remove_exclusion():
        indicator_type, value = _parse_payload(request.get_json(silent=True))
        if not indicator_type or not value:
            return jsonify({"message": "Invalid payload"}), 400

        normalised = normalise_indicator(indicator_type, value)
        if normalised is None:
            return jsonify({"message": "Value does not match indicator type"}), 400

        with session_scope() as session:
            repository = ExclusionRepository(session)
            exclusion = repository.remove(indicator_type, normalised)
            if exclusion is None:
                return jsonify({"message": "Indicator not found"}), 404
        _refresh_feeds(aggregator)
        return ("", 204)

    return app


def _parse_payload(payload: dict | None) -> Tuple[str | None, str | None]:
    if not payload:
        return None, None
    indicator_type = payload.get("indicator_type")
    value = payload.get("value")
    if indicator_type not in {"url", "domain", "ipv4"}:
        return None, None
    if not isinstance(value, str):
        return None, None
    return indicator_type, value


def _build_aggregator(app_config: AppConfig) -> FeedAggregator:
    cache_dir = Path(os.getenv("CACHE_DIR", "data"))
    return FeedAggregator(app_config.feed_config, cache_dir)


def _initial_refresh(aggregator: FeedAggregator) -> None:
    with session_scope() as session:
        repository = ExclusionRepository(session)
        aggregator.refresh(repository)


def _refresh_feeds(aggregator: FeedAggregator) -> None:
    """Recarrega os feeds, registrando possíveis erros."""
    try:
        _initial_refresh(aggregator)
    except Exception as error:  # pragma: no cover - defensive logging
        LOGGER.exception("Failed to refresh feeds: %s", error)
