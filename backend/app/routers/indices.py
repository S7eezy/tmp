"""Index discovery and mapping endpoints."""

from __future__ import annotations

from typing import Any

from elasticsearch import AsyncElasticsearch, NotFoundError
from fastapi import APIRouter, Depends, HTTPException, Query

from ..config import settings
from ..es_client import get_es
from ..models.schemas import GeoFieldsResponse, GeoTypeResponse, IndexInfo

router = APIRouter(tags=["indices"])


# ---------------------------------------------------------------------------
# GET /api/indices — list all non-system indices
# ---------------------------------------------------------------------------


@router.get("/indices", response_model=list[IndexInfo])
async def list_indices(es: AsyncElasticsearch = Depends(get_es)) -> list[IndexInfo]:
    resp = await es.cat.indices(format="json", h="index,docs.count,health,status")
    return [
        IndexInfo(
            index=row["index"],
            docsCount=int(row.get("docs.count", 0) or 0),
            health=row.get("health", "unknown"),
            status=row.get("status", "unknown"),
        )
        for row in resp
        if not row["index"].startswith(".")
    ]


# ---------------------------------------------------------------------------
# GET /api/indices/{index}/mapping
# ---------------------------------------------------------------------------


@router.get("/indices/{index}/mapping")
async def get_mapping(
    index: str,
    es: AsyncElasticsearch = Depends(get_es),
) -> dict[str, Any]:
    try:
        resp = await es.indices.get_mapping(index=index)
    except NotFoundError:
        raise HTTPException(404, f"Index '{index}' not found")
    first = next(iter(resp.values()), {})
    props = first.get("mappings", {}).get("properties", {})
    return {"properties": props}


# ---------------------------------------------------------------------------
# GET /api/indices/{index}/geo-fields
# ---------------------------------------------------------------------------


@router.get("/indices/{index}/geo-fields", response_model=GeoFieldsResponse)
async def detect_geo_fields(
    index: str,
    es: AsyncElasticsearch = Depends(get_es),
) -> GeoFieldsResponse:
    try:
        resp = await es.indices.get_mapping(index=index)
    except NotFoundError:
        raise HTTPException(404, f"Index '{index}' not found")
    first = next(iter(resp.values()), {})
    props: dict[str, Any] = first.get("mappings", {}).get("properties", {})
    geo_fields = [
        name
        for name, meta in props.items()
        if meta.get("type") in ("geo_point", "geo_shape")
    ]
    return GeoFieldsResponse(geoFields=geo_fields)


# ---------------------------------------------------------------------------
# GET /api/indices/{index}/geo-type?geo_field=location
# ---------------------------------------------------------------------------


@router.get("/indices/{index}/geo-type", response_model=GeoTypeResponse)
async def detect_geo_type(
    index: str,
    geo_field: str = Query("location"),
    es: AsyncElasticsearch = Depends(get_es),
) -> GeoTypeResponse:
    """Sample 10 docs and return the dominant geometry type."""
    resp = await es.search(index=index, query={"match_all": {}}, size=10)
    hits = resp["hits"]["hits"]
    if not hits:
        return GeoTypeResponse(geoType=None)

    tally: dict[str, int] = {}
    for hit in hits:
        geo = hit["_source"].get(geo_field)
        if geo is None:
            continue
        geo_type = _classify_geo(geo)
        if geo_type:
            tally[geo_type] = tally.get(geo_type, 0) + 1

    if not tally:
        return GeoTypeResponse(geoType=None)

    dominant = max(tally, key=lambda k: tally[k])
    return GeoTypeResponse(geoType=dominant)


def _classify_geo(geo: Any) -> str | None:
    """Determine simplified geo type from a single ES geo value."""
    if isinstance(geo, dict):
        if "lat" in geo and "lon" in geo:
            return "point"
        raw_type = geo.get("type", "")
        mapping = {
            "Point": "point",
            "MultiPoint": "point",
            "LineString": "line",
            "MultiLineString": "line",
            "Polygon": "polygon",
            "MultiPolygon": "polygon",
        }
        return mapping.get(raw_type)
    if isinstance(geo, list) and len(geo) == 2 and isinstance(geo[0], (int, float)):
        return "point"
    return None
