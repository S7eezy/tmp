"""Async Elasticsearch client — created once at startup, shared via dependency."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from elasticsearch import AsyncElasticsearch

from .config import settings

_es: AsyncElasticsearch | None = None


def _build_client() -> AsyncElasticsearch:
    """Construct the async ES client from settings."""
    kwargs: dict = {
        "hosts": [settings.es_url],
        "verify_certs": False,
        "ssl_show_warn": False,
    }
    if settings.es_api_key:
        kwargs["api_key"] = settings.es_api_key
    return AsyncElasticsearch(**kwargs)


@asynccontextmanager
async def lifespan_es() -> AsyncGenerator[None, None]:
    """FastAPI lifespan: open ES on startup, close on shutdown."""
    global _es
    _es = _build_client()
    try:
        yield
    finally:
        if _es:
            await _es.close()
            _es = None


def get_es() -> AsyncElasticsearch:
    """FastAPI dependency — returns the shared ES client."""
    if _es is None:
        raise RuntimeError("ES client not initialised (lifespan not started)")
    return _es
