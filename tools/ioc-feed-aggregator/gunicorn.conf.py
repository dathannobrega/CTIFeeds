"""Configuração do gunicorn (produção). Valores sobrescritos por variáveis de ambiente."""
from __future__ import annotations

import os

bind = os.getenv("GUNICORN_BIND", "0.0.0.0:5000")
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
worker_class = "gthread"
threads = int(os.getenv("GUNICORN_THREADS", "4"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
graceful_timeout = 30
keepalive = 5
# Recicla workers periodicamente (vazamentos de memória em libs de terceiros).
max_requests = 2000
max_requests_jitter = 200
accesslog = "-"
errorlog = "-"
forwarded_allow_ips = os.getenv("FORWARDED_ALLOW_IPS", "*")
# O socket de controle (gunicorn 26+) não é usado e precisaria de um $HOME gravável.
control_socket_disable = True


def on_starting(server):  # noqa: ARG001 - assinatura do hook
    """Cria as tabelas uma vez, no master, antes de abrir os workers (evita corrida no CREATE)."""
    from app.database import engine, init_db

    init_db()
    engine.dispose()
