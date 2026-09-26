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

    # Shared P1→P3 service identity (P1_BACKEND_INTEGRATION_REQUIREMENTS §14).
    # Empty disables authentication on /api/internal/* (previous behavior);
    # set the SAME value on both sides (P3_API_KEY in the P1 transport env).
    p3_api_key: str = ""

    # User authentication (JWT bearer tokens for /api/auth and protected
    # endpoints). SECRET_KEY signs the tokens — set it from the environment;
    # a deployed instance must never run on the insecure default. Empty also
    # disables token login for the seeded users (password_hash NULL). Dev
    # X-User-Id identity resolution is unchanged.
    secret_key: str = ""
    # Token login needs a non-empty signing key. In dev/test the `.env` file
    # (git-ignored) supplies it; deployed instances must set SECRET_KEY in the
    # environment. An empty value is only tolerated in `development`.
    secret_key: str = ""
    access_token_expire_minutes: int = 60


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
    if settings.environment not in ("development", "test") and not settings.secret_key:
        raise RuntimeError(
            "SECRET_KEY is not configured. "
            "Set it in the environment or in backend/.env (see backend/.env.example)."
        )
    if settings.access_token_expire_minutes < 1:
        raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES must be at least 1.")
