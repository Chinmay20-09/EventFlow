"""Application configuration (EV-029 — Configuration).

All configuration comes from the environment (or an optional local `.env` file).
Real secrets never belong in source code or in `.env.example`.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-based application settings."""

    # Read from env vars / .env. `extra="ignore"` keeps unrelated env vars quiet.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # PostgreSQL connection string, e.g.
    # postgresql+psycopg://user:password@localhost:5432/eventflow
    database_url: str = ""

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    environment: str = "development"

    # EV-015 §7: the MVP allows a maximum of two simulation attempts.
    max_simulation_attempts: int = 2


settings = Settings()


def validate_settings() -> None:
    """Fail fast at startup when required configuration is missing (EV-029 §11)."""
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL is not configured. "
            "Set it in the environment or in backend/.env (see backend/.env.example)."
        )
    if settings.max_simulation_attempts < 1:
        raise RuntimeError("MAX_SIMULATION_ATTEMPTS must be at least 1.")
