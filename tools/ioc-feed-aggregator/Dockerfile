# API do agregador de feeds (Flask + gunicorn). O frontend tem imagem própria em frontend/.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app
COPY config ./config
COPY wsgi.py gunicorn.conf.py docker-entrypoint.sh ./
RUN mkdir -p /app/data && chown app:app /app/data

ENV FLASK_APP=wsgi.py \
    DATABASE_URL=postgresql+psycopg2://postgres:postgres@db:5432/ctifeeds \
    FEED_CONFIG_PATH=/app/config/feeds.yaml \
    CACHE_DIR=/app/data

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/healthz', timeout=4).status == 200 else 1)"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:app"]
