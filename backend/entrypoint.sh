#!/bin/sh
# ── FleetTracker backend entrypoint ──────────────────────────
# All data lives in Elasticsearch — this script simply hands
# off to the main process (uvicorn).
# ──────────────────────────────────────────────────────────────

exec "$@"
