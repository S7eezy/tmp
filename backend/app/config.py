"""Centralised configuration — reads from environment variables.

Resolution order (pydantic-settings default):
  1. Actual environment variables   (set by docker-compose or shell)
  2. .env file                      (local dev fallback)

The env_file paths look for a .env in the backend dir first, then in the
project root (one level up) so `cd backend && uvicorn …` works out of the box.
"""

from pathlib import Path

from pydantic_settings import BaseSettings

_HERE = Path(__file__).resolve().parent          # backend/app/
_BACKEND = _HERE.parent                          # backend/
_ROOT = _BACKEND.parent                          # project root


class Settings(BaseSettings):
    """App settings populated from env vars (or .env file)."""

    es_url: str = "http://elasticsearch:9200"
    es_api_key: str | None = None
    es_max_hits: int = 10_000
    config_index: str = ".fleettracker-config"

    model_config = {
        # First match wins — backend/.env overrides root .env
        "env_file": [_BACKEND / ".env", _ROOT / ".env"],
        "extra": "ignore",
    }


settings = Settings()
