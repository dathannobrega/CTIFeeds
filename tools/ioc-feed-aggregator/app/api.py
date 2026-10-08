"""Rotas HTTP: API v1 (``/api/v1``), arquivos de feed e rotas legadas (``/exclusions``)."""
from __future__ import annotations

import hmac
import logging
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable, Dict, Tuple, TypeVar
from urllib.parse import urlsplit, urlunsplit

from flask import Blueprint, Flask, Response, current_app, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from .database import ping_db, session_scope
from .repositories import ExclusionRepository
from .services.feed_index import FeedIndex
from .services.feed_service import CHECKSUMS_FILE, FEED_FILES, FeedAggregator
from .services.lookup import lookup_indicator
from .services.validators import INDICATOR_TYPES, normalise_indicator

LOGGER = logging.getLogger(__name__)

API_VERSION = "2.0.0"
LOOKUP_BATCH_LIMIT = 500
SAMPLE_LIMIT = 120

api_v1 = Blueprint("api_v1", __name__, url_prefix="/api/v1")
public = Blueprint("public", __name__)

F = TypeVar("F", bound=Callable[..., Any])


def _aggregator() -> FeedAggregator:
    return current_app.extensions["feed_aggregator"]


def _index() -> FeedIndex:
    return current_app.extensions["feed_index"]


def _cached(response: Response, seconds: int) -> Response:
    response.headers["Cache-Control"] = f"public, max-age={seconds}"
    return response


def require_admin(view: F) -> F:
    """Exige ``Authorization: Bearer <ADMIN_TOKEN>`` quando ``ADMIN_TOKEN`` está definido."""

    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        token: str = current_app.config.get("ADMIN_TOKEN", "")
        if token:
            scheme, _, supplied = request.headers.get("Authorization", "").partition(" ")
            if scheme.lower() != "bearer" or not hmac.compare_digest(
                supplied.strip().encode("utf-8"), token.encode("utf-8")
            ):
                response = jsonify({"message": "Authentication required"})
                response.status_code = 401
                response.headers["WWW-Authenticate"] = 'Bearer realm="exclusions"'
                return response
        return view(*args, **kwargs)

    return wrapper  # type: ignore[return-value]


# Metadados e saúde -------------------------------------------------------------


@public.get("/healthz")
def healthz():
    database_ok = ping_db()
    state = _aggregator().read_state()
    body = {
        "status": "ok" if database_ok else "degraded",
        "database": "ok" if database_ok else "unavailable",
        "feeds": "ok" if state.get("published_at") else "pending",
    }
    response = jsonify(body)
    response.status_code = 200 if database_ok else 503
    response.headers["Cache-Control"] = "no-store"
    return response


@api_v1.get("/meta")
def meta():
    return _cached(
        jsonify(
            {
                "version": API_VERSION,
                "auth_required": bool(current_app.config.get("ADMIN_TOKEN")),
                "indicator_types": list(INDICATOR_TYPES),
                "lookup_batch_limit": LOOKUP_BATCH_LIMIT,
                "refresh_interval_seconds": current_app.config["REFRESH_INTERVAL_SECONDS"],
                "feeds": {kind: f"/feeds/{name}" for kind, name in FEED_FILES.items()},
                "checksums": f"/feeds/{CHECKSUMS_FILE}",
            }
        ),
        300,
    )


@api_v1.get("/stats")
def stats():
    state = _aggregator().read_state()
    with session_scope() as session:
        exclusions = ExclusionRepository(session).count_by_type()

    feeds: Dict[str, Dict[str, Any]] = {}
    for kind in INDICATOR_TYPES:
        meta_ = dict(state.get("feeds", {}).get(kind) or {})
        meta_.setdefault("file", FEED_FILES[kind])
        meta_.setdefault("count", 0)
        meta_["path"] = f"/feeds/{FEED_FILES[kind]}"
        feeds[kind] = meta_

    sources = state.get("sources", [])
    interval = current_app.config["REFRESH_INTERVAL_SECONDS"]
    totals = {kind: feeds[kind]["count"] for kind in INDICATOR_TYPES}
    totals["all"] = sum(totals.values())
    body = {
        "generated_at": _now(),
        "collected_at": state.get("collected_at"),
        "published_at": state.get("published_at"),
        "refresh_interval_seconds": interval,
        "next_collection_at": _next_collection(state.get("collected_at"), interval),
        "totals": totals,
        "feeds": feeds,
        "exclusions": {kind: exclusions.get(kind, 0) for kind in INDICATOR_TYPES},
        "sources": {
            "configured": len(_aggregator().sources()),
            "ok": sum(1 for item in sources if item.get("ok")),
            "stale": sum(1 for item in sources if item.get("stale")),
            "failed": sum(1 for item in sources if not item.get("ok")),
        },
    }
    return _cached(jsonify(body), 30)


@api_v1.get("/sources")
def sources():
    state = _aggregator().read_state()
    reports = {(item.get("indicator_type"), item.get("url")): item for item in state.get("sources", [])}
    items = []
    for kind, url in _aggregator().sources():
        report = reports.get((kind, url), {})
        items.append(
            {
                "indicator_type": kind,
                # Sem query string nem usuário/senha: fontes podem levar chave de API na URL.
                "url": _public_url(url),
                "host": urlsplit(url).hostname or "",
                "ok": report.get("ok"),
                "stale": report.get("stale", False),
                "count": report.get("count", 0),
                "invalid": report.get("invalid", 0),
                "duration_ms": report.get("duration_ms"),
                "error": report.get("error"),
                "fetched_at": report.get("fetched_at"),
            }
        )
    return _cached(jsonify({"collected_at": state.get("collected_at"), "sources": items}), 30)


@api_v1.get("/sample")
def sample():
    limit = _int_arg("limit", 30, 1, SAMPLE_LIMIT)
    requested = request.args.get("type")
    kinds = [requested] if requested in INDICATOR_TYPES else list(INDICATOR_TYPES)
    per_type = max(1, -(-limit // len(kinds)))
    pools = {kind: _index().sample(kind, per_type) for kind in kinds}
    items = []
    # Intercala os tipos para a amostra não vir em blocos.
    for position in range(per_type):
        for kind in kinds:
            if position < len(pools[kind]):
                items.append({"type": kind, "value": pools[kind][position]})
    return _cached(jsonify({"items": items[:limit]}), 120)


# Consulta ----------------------------------------------------------------------


@api_v1.get("/lookup")
def lookup_single():
    query = (request.args.get("value") or request.args.get("q") or "").strip()
    if not query:
        return _error("Missing 'value' query parameter", 400)
    if len(query) > 2048:
        return _error("Value too long", 400)
    kind = request.args.get("type")
    with session_scope() as session:
        repository = ExclusionRepository(session)

        def excluded_at(indicator_type: str, value: str) -> str | None:
            found = repository.get(indicator_type, value)
            return _iso(found.created_at) if found else None

        result = lookup_indicator(query, _index(), excluded_at, kind)
    result["feeds_published_at"] = _aggregator().read_state().get("published_at")
    response = jsonify(result)
    response.headers["Cache-Control"] = "no-store"
    return response


@api_v1.post("/lookup")
def lookup_batch():
    payload = request.get_json(silent=True) or {}
    values = payload.get("values")
    if not isinstance(values, list) or not all(isinstance(item, str) for item in values):
        return _error("Expected JSON body {\"values\": [\"...\"]}", 400)
    queries = [item.strip() for item in values if item and item.strip()]
    if not queries:
        return _error("No values to look up", 400)
    if len(queries) > LOOKUP_BATCH_LIMIT:
        return _error(f"At most {LOOKUP_BATCH_LIMIT} values per request", 413)
    queries = [query[:2048] for query in queries]

    with session_scope() as session:
        repository = ExclusionRepository(session)
        cache: Dict[Tuple[str, str], str | None] = {}
        results = [lookup_indicator(query, _index(), lambda *_: None) for query in queries]
        wanted = {(item["type"], item["value"]) for item in results if item["valid"]}
        for key, exclusion in repository.find_many(wanted).items():
            cache[key] = _iso(exclusion.created_at)
    for item in results:
        if item["valid"]:
            excluded = cache.get((item["type"], item["value"]))
            item["excluded"] = excluded is not None
            item["excluded_at"] = excluded
    summary = {
        "total": len(results),
        "listed": sum(1 for item in results if item["listed"]),
        "related": sum(1 for item in results if not item["listed"] and item["related"]),
        "excluded": sum(1 for item in results if item["excluded"]),
        "invalid": sum(1 for item in results if not item["valid"]),
    }
    response = jsonify(
        {
            "summary": summary,
            "results": results,
            "feeds_published_at": _aggregator().read_state().get("published_at"),
        }
    )
    response.headers["Cache-Control"] = "no-store"
    return response


# Lista de exclusão -------------------------------------------------------------


@require_admin
def list_exclusions():
    with session_scope() as session:
        repository = ExclusionRepository(session)
        exclusions = [item.to_dict() for item in repository.list_all()]
    response = jsonify(exclusions)
    response.headers["Cache-Control"] = "no-store"
    return response


@require_admin
def add_exclusion():
    indicator_type, value = _parse_payload(request.get_json(silent=True))
    if not indicator_type or not value:
        return _error("Invalid payload", 400)

    normalised = normalise_indicator(indicator_type, value)
    if normalised is None:
        return _error("Value does not match indicator type", 400)

    with session_scope() as session:
        repository = ExclusionRepository(session)
        try:
            exclusion = repository.add(indicator_type, normalised)
        except ValueError as error:
            return _error(str(error), 400)
    _publish_feeds()
    return jsonify(exclusion.to_dict()), 201


@require_admin
def remove_exclusion():
    indicator_type, value = _parse_payload(request.get_json(silent=True))
    if not indicator_type or not value:
        return _error("Invalid payload", 400)

    normalised = normalise_indicator(indicator_type, value)
    if normalised is None:
        return _error("Value does not match indicator type", 400)

    with session_scope() as session:
        repository = ExclusionRepository(session)
        exclusion = repository.remove(indicator_type, normalised)
        if exclusion is None:
            return _error("Indicator not found", 404)
    _publish_feeds()
    return ("", 204)


# Mesmas views em /api/v1/exclusions e na rota legada /exclusions.
for blueprint, rule in ((api_v1, "/exclusions"), (public, "/exclusions")):
    blueprint.add_url_rule(rule, "list_exclusions", list_exclusions, methods=["GET"])
    blueprint.add_url_rule(rule, "add_exclusion", add_exclusion, methods=["POST"])
    blueprint.add_url_rule(rule, "remove_exclusion", remove_exclusion, methods=["DELETE"])


# Arquivos de feed --------------------------------------------------------------


@public.get("/feeds/<name>")
def feed_file(name: str):
    """Em produção o nginx serve estes arquivos direto do volume; isto cobre o ``flask run``."""
    if name not in {*FEED_FILES.values(), CHECKSUMS_FILE}:
        return _error("Not found", 404)
    response = send_from_directory(
        _aggregator().cache_dir, name, mimetype="text/plain", max_age=300
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


# Utilitários -------------------------------------------------------------------


def register_routes(app: Flask) -> None:
    app.register_blueprint(api_v1)
    app.register_blueprint(public)

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException):
        return _error(error.description or error.name, error.code or 500)

    @app.errorhandler(Exception)
    def unexpected_error(error: Exception):  # pragma: no cover - defensive logging
        LOGGER.exception("Unhandled error: %s", error)
        return _error("Internal server error", 500)

    @app.after_request
    def security_headers(response: Response) -> Response:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        if request.path.startswith("/api/") or request.path == "/exclusions":
            response.headers.setdefault("X-Robots-Tag", "noindex")
        return response


def _publish_feeds() -> None:
    """Republica os feeds após mudar a lista de exclusão; falhas só são registradas."""
    try:
        with session_scope() as session:
            _aggregator().publish(ExclusionRepository(session))
    except Exception as error:  # pragma: no cover - defensive logging
        LOGGER.exception("Failed to publish feeds: %s", error)


def _parse_payload(payload: dict | None) -> Tuple[str | None, str | None]:
    if not isinstance(payload, dict):
        return None, None
    indicator_type = payload.get("indicator_type")
    value = payload.get("value")
    if indicator_type not in INDICATOR_TYPES:
        return None, None
    if not isinstance(value, str):
        return None, None
    return indicator_type, value


def _error(message: str, status: int):
    response = jsonify({"message": message})
    response.status_code = status
    return response


def _int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


def _public_url(url: str) -> str:
    parts = urlsplit(url)
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    return urlunsplit((parts.scheme, host, parts.path, "", ""))


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _next_collection(collected_at: str | None, interval: int) -> str | None:
    if not collected_at or interval <= 0:
        return None
    try:
        last = datetime.fromisoformat(collected_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (last + timedelta(seconds=interval)).isoformat().replace("+00:00", "Z")
