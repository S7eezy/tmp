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

    # 1. Fields explicitly mapped as geo_point / geo_shape
    geo_fields = [
        name
        for name, meta in props.items()
        if meta.get("type") in ("geo_point", "geo_shape")
    ]

    # 2. If none found, probe object-typed fields that may contain GeoJSON
    #    (common when data is ingested without explicit geo mapping)
    if not geo_fields:
        candidate_names = _geo_field_candidates(props)
        if candidate_names:
            try:
                sample = await es.search(index=index, query={"match_all": {}}, size=1)
                hits = sample["hits"]["hits"]
                if hits:
                    src = hits[0]["_source"]
                    for name in candidate_names:
                        val = src.get(name)
                        if val is not None and _classify_geo(val) is not None:
                            geo_fields.append(name)
            except Exception:
                pass  # Sampling failed — return empty

    return GeoFieldsResponse(geoFields=geo_fields)


def _geo_field_candidates(props: dict[str, Any]) -> list[str]:
    """Return field names that look like they might contain geo data.

    Matches by: mapping type (object with coordinates sub-field),
    or common geo field names.
    """
    GEO_NAMES = {"geometry", "location", "geo", "position", "coordinates", "geom",
                 "geo_point", "geopoint", "the_geom", "geolocation", "latlon", "latlng"}
    candidates: list[str] = []
    for name, meta in props.items():
        # Object field that has a "coordinates" sub-property → likely GeoJSON
        sub_props = meta.get("properties", {})
        if "coordinates" in sub_props:
            candidates.append(name)
            continue
        # Well-known geo field names stored as object/keyword/etc.
        if name.lower() in GEO_NAMES and meta.get("type") not in (
            "text", "keyword", "long", "integer", "float", "double", "boolean",
        ):
            candidates.append(name)
    return candidates


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
    """Determine simplified geo type from a single ES geo value.

    Handles all ES geo_point formats:
      - {lat, lon}         → point
      - GeoJSON dict       → mapped type
      - [lon, lat]         → point
      - [lon, lat, alt]    → point (3-D)
      - "lat,lon" string   → point
    """
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
    # ES geo_point can be [lon, lat] or [lon, lat, alt]
    if isinstance(geo, list) and len(geo) in (2, 3) and all(isinstance(v, (int, float)) for v in geo):
        return "point"
    # ES geo_point as "lat,lon" string
    if isinstance(geo, str) and "," in geo:
        parts = geo.split(",")
        if len(parts) == 2:
            try:
                float(parts[0])
                float(parts[1])
                return "point"
            except ValueError:
                pass
    return None
