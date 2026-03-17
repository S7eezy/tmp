"""Data search, GeoJSON, count, and vector-tile endpoints."""

from __future__ import annotations

from typing import Any

from elasticsearch import AsyncElasticsearch
from fastapi import APIRouter, Depends, Query, Response

from ..config import settings
from ..es_client import get_es
from ..models.schemas import CountRequest, CountResponse, MvtRequest, SearchRequest

router = APIRouter(tags=["data"])


# ---------------------------------------------------------------------------
# POST /api/indices/{index}/search — raw ES search passthrough
# ---------------------------------------------------------------------------


@router.post("/indices/{index}/search")
async def search(
    index: str,
    body: SearchRequest | None = None,
    es: AsyncElasticsearch = Depends(get_es),
) -> dict[str, Any]:
    body = body or SearchRequest()
    kwargs: dict[str, Any] = {
        "index": index,
        "query": body.query or {"match_all": {}},
        "size": body.size or settings.es_max_hits,
    }
    if body.sort:
        kwargs["sort"] = body.sort
    if body.source:
        kwargs["source"] = body.source

    resp = await es.search(**kwargs)
    return resp.body


# ---------------------------------------------------------------------------
# POST /api/indices/{index}/geojson — search + GeoJSON transform
# ---------------------------------------------------------------------------


@router.post("/indices/{index}/geojson")
async def search_geojson(
    index: str,
    geo_field: str = Query("location"),
    body: SearchRequest | None = None,
    es: AsyncElasticsearch = Depends(get_es),
) -> dict[str, Any]:
    """Run an ES search and return results as a GeoJSON FeatureCollection."""
    body = body or SearchRequest()
    kwargs: dict[str, Any] = {
        "index": index,
        "query": body.query or {"match_all": {}},
        "size": body.size or settings.es_max_hits,
    }
    if body.sort:
        kwargs["sort"] = body.sort
    if body.source:
        kwargs["source"] = body.source

    resp = await es.search(**kwargs)
    hits = resp["hits"]["hits"]

    features: list[dict[str, Any]] = []
    for hit in hits:
        src = hit["_source"]
        geo = src.get(geo_field)
        if geo is None:
            continue

        geometry = _to_geometry(geo)
        if geometry is None:
            continue

        # Build properties — strip the geo field to avoid duplication
        props: dict[str, Any] = {"_id": hit["_id"], "_index": hit["_index"]}
        for k, v in src.items():
            if k != geo_field:
                props[k] = v

        features.append(
            {"type": "Feature", "geometry": geometry, "properties": props}
        )

    return {"type": "FeatureCollection", "features": features}


def _to_geometry(geo: Any) -> dict[str, Any] | None:
    """Convert an ES geo value to a GeoJSON geometry dict.

    Supports:
      - geo_point as {lat, lon}
      - geo_point as [lon, lat]
      - geo_shape as raw GeoJSON geometry (passthrough)
    """
    if isinstance(geo, dict):
        if "lat" in geo and "lon" in geo:
            return {
                "type": "Point",
                "coordinates": [float(geo["lon"]), float(geo["lat"])],
            }
        if "type" in geo:
            # Already a GeoJSON geometry — pass through
            return geo
    if isinstance(geo, list) and len(geo) == 2 and isinstance(geo[0], (int, float)):
        return {"type": "Point", "coordinates": [geo[0], geo[1]]}
    return None


# ---------------------------------------------------------------------------
# POST /api/indices/{index}/count
# ---------------------------------------------------------------------------


@router.post("/indices/{index}/count", response_model=CountResponse)
async def count(
    index: str,
    body: CountRequest | None = None,
    es: AsyncElasticsearch = Depends(get_es),
) -> CountResponse:
    resp = await es.count(index=index, query=(body.query if body else None) or {"match_all": {}})
    return CountResponse(count=resp["count"])


# ---------------------------------------------------------------------------
# POST /api/indices/{index}/mvt/{field}/{z}/{x}/{y}
# ---------------------------------------------------------------------------


@router.post("/indices/{index}/mvt/{field}/{z}/{x}/{y}")
async def vector_tile(
    index: str,
    field: str,
    z: int,
    x: int,
    y: int,
    body: MvtRequest | None = None,
    es: AsyncElasticsearch = Depends(get_es),
) -> Response:
    """Proxy ES vector tile requests — returns raw MVT binary."""
    kwargs: dict[str, Any] = {
        "index": index,
        "field": field,
        "zoom": z,
        "x": x,
        "y": y,
    }
    if body and body.query:
        kwargs["query"] = body.query

    resp = await es.search_mvt(**kwargs)
    return Response(
        content=resp.body,
        media_type="application/vnd.mapbox-vector-tile",
    )
