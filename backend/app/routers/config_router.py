"""Generic config persistence — read/write docs in .fleettracker-config index."""

from __future__ import annotations

from typing import Any

from elasticsearch import AsyncElasticsearch, NotFoundError
from fastapi import APIRouter, Body, Depends, HTTPException

from ..config import settings
from ..es_client import get_es

router = APIRouter(tags=["config"])

INDEX = settings.config_index


async def _ensure_index(es: AsyncElasticsearch) -> None:
    """Create the config index if it does not exist."""
    if await es.indices.exists(index=INDEX):
        return
    await es.indices.create(
        index=INDEX,
        body={"settings": {"number_of_shards": 1, "number_of_replicas": 0}},
    )


# ---------------------------------------------------------------------------
# GET /api/config/{doc_id}
# ---------------------------------------------------------------------------


@router.get("/config/{doc_id}")
async def get_config(
    doc_id: str,
    es: AsyncElasticsearch = Depends(get_es),
) -> dict[str, Any]:
    try:
        resp = await es.get(index=INDEX, id=doc_id)
        return resp["_source"]
    except NotFoundError:
        raise HTTPException(404, f"Config doc '{doc_id}' not found")


# ---------------------------------------------------------------------------
# PUT /api/config/{doc_id}
# ---------------------------------------------------------------------------


@router.put("/config/{doc_id}")
async def put_config(
    doc_id: str,
    body: dict[str, Any] = Body(...),
    es: AsyncElasticsearch = Depends(get_es),
) -> dict[str, Any]:
    await _ensure_index(es)
    await es.index(index=INDEX, id=doc_id, document=body)
    return {"ok": True}
