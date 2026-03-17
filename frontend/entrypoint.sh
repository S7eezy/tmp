#!/bin/sh
# ── FleetTracker frontend entrypoint ─────────────────────────
# Resolves backend/geoserver/tileserver URLs in the nginx config
# template, then starts nginx in the foreground.
#
# All URLs must be bare origins: scheme + host[:port]
# NO trailing slash, NO path suffix.
# ──────────────────────────────────────────────────────────────

export BACKEND_URL="${BACKEND_URL:-http://backend:8000}"
export GEOSERVER_URL="${GEOSERVER_URL:-http://geoserver:8080}"
export TILESERVER_URL="${TILESERVER_URL:-http://tileserver:8080}"

# Strip trailing slashes (common misconfiguration)
BACKEND_URL="${BACKEND_URL%/}"
GEOSERVER_URL="${GEOSERVER_URL%/}"
TILESERVER_URL="${TILESERVER_URL%/}"

echo "[entrypoint] BACKEND_URL    = '${BACKEND_URL}'"
echo "[entrypoint] GEOSERVER_URL  = '${GEOSERVER_URL}'"
echo "[entrypoint] TILESERVER_URL = '${TILESERVER_URL}'"

envsubst '${BACKEND_URL} ${GEOSERVER_URL} ${TILESERVER_URL}' \
    < /etc/nginx/nginx.conf.template \
    > /tmp/nginx.conf

echo "[entrypoint] Generated /tmp/nginx.conf"

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
