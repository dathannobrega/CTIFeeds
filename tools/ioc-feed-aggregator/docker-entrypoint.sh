#!/bin/sh
# Ajusta o dono do volume de cache (instalações antigas rodavam como root) e
# executa o processo como usuário sem privilégios.
set -eu

if [ "$(id -u)" = "0" ]; then
    mkdir -p "${CACHE_DIR:-/app/data}"
    chown -R app:app "${CACHE_DIR:-/app/data}"
    exec setpriv --reuid=app --regid=app --init-groups "$@"
fi

exec "$@"
