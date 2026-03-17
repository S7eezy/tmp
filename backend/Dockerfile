# ── FleetTracker Backend ─────────────────────────────────────
# FastAPI + Uvicorn on Python 3.13
# Multi-stage + Alpine + OpenShift random UID compatible
# ─────────────────────────────────────────────────────────────

# ── Stage 1 : Builder ───────────────────────────────────────
FROM python:3.11-alpine AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /install

# Build dependencies for wheels (elasticsearch needs some C exts)
RUN apk add --no-cache build-base libffi-dev

COPY requirements.txt .
# Install Python deps into isolated prefix
RUN pip install --prefix=/install -r requirements.txt

# ── Stage 2 : Runtime ───────────────────────────────────────
FROM python:3.11-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copy only installed dependencies from builder
COPY --from=builder /install /usr/local

# Copy application
COPY . .

# OpenShift filesystem permissions (random UID, group 0)
RUN chmod g+rx /app/entrypoint.sh \
    && chgrp -R 0 /app /usr/local \
    && chmod -R g+rwX /app /usr/local

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
