"""Health endpoint (task Phase 2)."""

from fastapi import APIRouter

from app.core.config import settings
from app.core.errors import ok

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict:
    """Simple liveness probe using the documented success envelope (EV-016 §3)."""
    # Health is a cross-cutting endpoint; it must never be event-scoped and
    # must stay readable by any caller (EV-023 §10: reads are not the
    # authorization boundary).
    return ok(
        {
            "status": "ok",
            "environment": settings.environment,
            "max_simulation_attempts": settings.max_simulation_attempts,
        }
    )
