"""Pydantic models for request / response validation."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    """Body for POST /indices/{index}/search and /geojson."""

    query: dict[str, Any] | None = None
    size: int | None = None
    sort: list[dict[str, Any]] | None = None
    source: list[str] | None = Field(None, alias="_source")

    model_config = {"populate_by_name": True}


class CountRequest(BaseModel):
    """Body for POST /indices/{index}/count."""

    query: dict[str, Any] | None = None


class MvtRequest(BaseModel):
    """Optional body for POST /indices/{index}/mvt/…"""

    query: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class IndexInfo(BaseModel):
    index: str
    docsCount: int
    health: str
    status: str


class GeoFieldsResponse(BaseModel):
    geoFields: list[str]


class GeoTypeResponse(BaseModel):
    geoType: Literal["point", "line", "polygon"] | None


class CountResponse(BaseModel):
    count: int
