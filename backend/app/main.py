"""FleetTracker API — FastAPI entry point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .es_client import lifespan_es
from .routers import indices, data, config_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage the async ES client across the app's lifetime."""
    async with lifespan_es():
        yield


app = FastAPI(title="FleetTracker API", lifespan=lifespan)

# CORS — permissive for dev; tighten origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers — all under /api prefix
app.include_router(indices.router, prefix="/api")
app.include_router(data.router, prefix="/api")
app.include_router(config_router.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
