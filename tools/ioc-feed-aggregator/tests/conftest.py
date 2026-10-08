"""Fixtures: SQLite temporário no lugar do PostgreSQL e downloads simulados."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Callable, Dict, Iterator

import pytest

# O engine é criado na importação de app.database: configure o ambiente antes.
_TMP = Path(tempfile.mkdtemp(prefix="ioc-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["REFRESH_INTERVAL_SECONDS"] = "0"
os.environ.pop("ADMIN_TOKEN", None)

from app import create_app  # noqa: E402
from app.config import FeedConfig  # noqa: E402
from app.database import engine  # noqa: E402
from app.models import Base  # noqa: E402
from app.services.feed_service import FeedAggregator  # noqa: E402

SOURCES = {
    "https://feeds.test/urls.txt": "# comentário\nhttp://evil.example/login\nhttps://203.0.113.9/payload.bin\nnão-é-url\n",
    "https://feeds.test/domains.txt": "Evil.Example\nbad.test\n\n",
    "https://feeds.test/ipv4.txt": "203.0.113.9\n198.51.100.7\n999.1.1.1\n",
}


class FakeDownloader:
    def __init__(self, responses: Dict[str, str]) -> None:
        self.responses = dict(responses)
        self.failing: set[str] = set()
        self.calls = 0

    def __call__(self, url: str) -> str:
        import requests

        self.calls += 1
        if url in self.failing:
            raise requests.ConnectionError("boom")
        return self.responses[url]


@pytest.fixture()
def downloader() -> FakeDownloader:
    return FakeDownloader(SOURCES)


@pytest.fixture()
def aggregator(tmp_path: Path, downloader: FakeDownloader) -> FeedAggregator:
    config = FeedConfig(
        urls=["https://feeds.test/urls.txt"],
        domains=["https://feeds.test/domains.txt"],
        ipv4=["https://feeds.test/ipv4.txt"],
    )
    return FeedAggregator(config, tmp_path / "cache", downloader=downloader)


@pytest.fixture()
def make_app(aggregator: FeedAggregator) -> Iterator[Callable[..., object]]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def factory(**config: object):
        return create_app({"TESTING": True, **config}, aggregator=aggregator)

    yield factory


@pytest.fixture()
def client(make_app):
    return make_app().test_client()
