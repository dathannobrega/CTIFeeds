from __future__ import annotations

import time

from app.scheduler import RefreshScheduler


def _wait_for(condition, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.05)
    return False


def test_only_one_scheduler_collects(make_app, aggregator, downloader):
    make_app()  # cria as tabelas
    first = RefreshScheduler(aggregator, interval=3600, initial_delay=0, retry=60)
    second = RefreshScheduler(aggregator, interval=3600, initial_delay=0, retry=60)
    first.start()
    assert _wait_for(lambda: aggregator.read_state().get("collected_at"))
    second.start()
    time.sleep(0.3)
    first.stop()
    second.stop()
    # Uma coleta (3 fontes), não duas: o segundo não obtém a trava nem está "devido".
    assert downloader.calls == 3
    assert (aggregator.cache_dir / "ipv4.txt").read_text() == "198.51.100.7\n203.0.113.9\n"
