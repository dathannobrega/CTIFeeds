from __future__ import annotations

from app.database import session_scope
from app.repositories import ExclusionRepository


def _refresh(aggregator) -> None:
    with session_scope() as session:
        aggregator.refresh(ExclusionRepository(session))


def test_refresh_publishes_normalised_feeds(client, aggregator):
    _refresh(aggregator)
    cache = aggregator.cache_dir
    assert (cache / "domains.txt").read_text() == "bad.test\nevil.example\n"
    assert (cache / "ipv4.txt").read_text() == "198.51.100.7\n203.0.113.9\n"
    assert "http://evil.example/login" in (cache / "urls.txt").read_text()
    assert (cache / "SHA256SUMS").read_text().count("\n") == 3
    assert oct((cache / "urls.txt").stat().st_mode & 0o777) == "0o644"


def test_stats_reports_counts_and_sources(client, aggregator):
    _refresh(aggregator)
    body = client.get("/api/v1/stats").get_json()
    assert body["totals"] == {"url": 2, "domain": 2, "ipv4": 2, "all": 6}
    assert body["feeds"]["ipv4"]["path"] == "/feeds/ipv4.txt"
    assert len(body["feeds"]["url"]["sha256"]) == 64
    assert body["sources"] == {"configured": 3, "ok": 3, "stale": 0, "failed": 0}


def test_stats_before_first_collection(client):
    body = client.get("/api/v1/stats").get_json()
    assert body["totals"]["all"] == 0
    assert body["collected_at"] is None


def test_failed_source_keeps_last_good_copy(client, aggregator, downloader):
    _refresh(aggregator)
    downloader.failing.add("https://feeds.test/ipv4.txt")
    _refresh(aggregator)
    assert (aggregator.cache_dir / "ipv4.txt").read_text() == "198.51.100.7\n203.0.113.9\n"
    sources = client.get("/api/v1/sources").get_json()["sources"]
    ipv4 = next(item for item in sources if item["indicator_type"] == "ipv4")
    assert ipv4["ok"] is False and ipv4["stale"] is True and ipv4["error"] == "connection error"


def test_sources_hide_credentials(make_app, aggregator):
    from app.config import FeedConfig

    aggregator._feed_config = FeedConfig(urls=["https://user:pw@feeds.test/u.txt?key=secret"], domains=[], ipv4=[])
    body = make_app().test_client().get("/api/v1/sources").get_json()
    assert body["sources"][0]["url"] == "https://feeds.test/u.txt"


def test_lookup_detects_type_and_refangs(client, aggregator):
    _refresh(aggregator)
    body = client.get("/api/v1/lookup", query_string={"value": "evil[.]example"}).get_json()
    assert body["type"] == "domain" and body["listed"] is True and body["value"] == "evil.example"

    body = client.get("/api/v1/lookup", query_string={"value": "hxxp://evil[.]example/other"}).get_json()
    assert body["type"] == "url" and body["listed"] is False
    assert {"type": "domain", "value": "evil.example", "relation": "url_host"} in body["related"]

    body = client.get("/api/v1/lookup", query_string={"value": "cdn.evil.example"}).get_json()
    assert body["listed"] is False
    assert body["related"][0]["relation"] == "parent_domain"

    body = client.get("/api/v1/lookup", query_string={"value": "not valid"}).get_json()
    assert body["valid"] is False

    assert client.get("/api/v1/lookup").status_code == 400


def test_batch_lookup(client, aggregator):
    _refresh(aggregator)
    response = client.post("/api/v1/lookup", json={"values": ["203.0.113.9", "192.0.2.1", "x y"]})
    body = response.get_json()
    assert body["summary"] == {"total": 3, "listed": 1, "related": 0, "excluded": 0, "invalid": 1}
    assert client.post("/api/v1/lookup", json={"values": ["1.1.1.1"] * 501}).status_code == 413
    assert client.post("/api/v1/lookup", json={"nope": 1}).status_code == 400


def test_exclusion_republishes_without_downloading(client, aggregator, downloader):
    _refresh(aggregator)
    calls = downloader.calls
    response = client.post("/api/v1/exclusions", json={"indicator_type": "ipv4", "value": "203.0.113.9"})
    assert response.status_code == 201
    assert downloader.calls == calls
    assert (aggregator.cache_dir / "ipv4.txt").read_text() == "198.51.100.7\n"

    lookup = client.get("/api/v1/lookup", query_string={"value": "203.0.113.9"}).get_json()
    assert lookup["excluded"] is True and lookup["listed"] is False and lookup["excluded_at"].endswith("Z")

    duplicate = client.post("/exclusions", json={"indicator_type": "ipv4", "value": "203.0.113.9"})
    assert duplicate.status_code == 400
    assert duplicate.get_json()["message"] == "Indicator already excluded"

    assert client.delete("/exclusions", json={"indicator_type": "ipv4", "value": "203.0.113.9"}).status_code == 204
    assert "203.0.113.9" in (aggregator.cache_dir / "ipv4.txt").read_text()
    assert client.delete("/exclusions", json={"indicator_type": "ipv4", "value": "203.0.113.9"}).status_code == 404


def test_exclusion_without_previous_collection_downloads(client, aggregator, downloader):
    response = client.post("/exclusions", json={"indicator_type": "domain", "value": "Bad.Test"})
    assert response.status_code == 201
    assert downloader.calls == 3
    assert (aggregator.cache_dir / "domains.txt").read_text() == "evil.example\n"


def test_exclusion_validation(client):
    assert client.post("/exclusions", json={"indicator_type": "ipv6", "value": "::1"}).status_code == 400
    assert client.post("/exclusions", json={"indicator_type": "ipv4", "value": "nope"}).status_code == 400
    assert client.post("/exclusions", data="x").status_code == 400


def test_admin_token_protects_exclusions(make_app):
    client = make_app(ADMIN_TOKEN="s3cret").test_client()
    assert client.get("/api/v1/meta").get_json()["auth_required"] is True
    assert client.get("/exclusions").status_code == 401
    payload = {"indicator_type": "domain", "value": "ok.test"}
    assert client.post("/api/v1/exclusions", json=payload).status_code == 401
    assert client.post("/api/v1/exclusions", json=payload, headers={"Authorization": "Bearer wrong"}).status_code == 401
    ok = client.post("/api/v1/exclusions", json=payload, headers={"Authorization": "Bearer s3cret"})
    assert ok.status_code == 201
    listed = client.get("/api/v1/exclusions", headers={"Authorization": "Bearer s3cret"}).get_json()
    assert listed[0]["value"] == "ok.test"


def test_sample_feed_files_and_health(client, aggregator):
    _refresh(aggregator)
    items = client.get("/api/v1/sample", query_string={"limit": 4}).get_json()["items"]
    assert len(items) == 4 and {item["type"] for item in items} == {"url", "domain", "ipv4"}

    response = client.get("/feeds/ipv4.txt")
    assert response.status_code == 200 and response.mimetype == "text/plain"
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    assert client.get("/feeds/state.json").status_code == 404

    health = client.get("/healthz").get_json()
    assert health == {"status": "ok", "database": "ok", "feeds": "ok"}
    missing = client.get("/api/v1/nope")
    assert missing.status_code == 404 and "message" in missing.get_json()
