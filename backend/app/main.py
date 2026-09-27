"""EventFlow P3 backend application (FastAPI).

P3 owns API, persistence, validation, state management and integration
(EV-003 §2). It does not calculate crowd, prediction, optimization or
strategy results — those arrive from P1/P2 through validated inputs.
"""

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import every model module so SQLAlchemy metadata is complete before create_all.
from app import models  # noqa: F401
from app.api.routes import (
    alerts,
    auth,
    crowd,
    dashboard,
    disruptions,
    edges,
    events,
    health,
    live,
    nodes,
    p1,
    predictions,
    strategy_sets,
)
from app.api.routes import settings as settings_router
from app.core.config import settings, validate_settings
from app.core.errors import setup_error_handlers
from app.db.base import Base
from app.db.migrations import run_startup_migrations
from app.db.seed import ensure_default_admin
from app.db.session import get_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate configuration at startup, then ensure tables exist (EV-029 §11)."""
    validate_settings()
    engine = get_engine()
    Base.metadata.create_all(engine)
    # Add columns that create_all cannot add to existing tables (auth + P4 map).
    run_startup_migrations(engine)
    # Default development account (admin/admin123) so the frontend can sign
    # in without the auth screen. Idempotent: created only when missing.
    # Skipped in the test environment: the automated tests seed their own
    # users and assert exact user ids (tests/conftest.py).
    if settings.environment != "test":
        ensure_default_admin(engine)
    # Capture the running loop so live-update broadcasts can be scheduled
    # onto it from synchronous request handlers (see services.live_updates).
    import asyncio

    from app.services.live_updates import manager

    manager.set_loop(asyncio.get_running_loop())
    yield
    manager.set_loop(None)


app = FastAPI(
    title="EventFlow P3 API",
    version="0.1.0",
    description="Backend / data / integration layer for the EventFlow MVP (P3).",
    lifespan=lifespan,
)

# Allow the P4 development frontend.
# vite may shift to the next free port (5174, 5175, ...) when 5173 is taken,
# and browsers treat 127.0.0.1 as a different origin from localhost — so the
# allow-list covers the standard dev loopback variants. Deployments set
# CORS_EXTRA_ORIGINS for their real P4 origin instead of editing this file.
_extra = [o.strip() for o in os.getenv("CORS_EXTRA_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        *_extra,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_error_handlers(app)

for router in (
    health.router,
    auth.router,
    events.router,
    nodes.router,
    edges.router,
    crowd.router,
    p1.router,
    disruptions.router,
    predictions.router,
    strategy_sets.router,
    dashboard.router,
    alerts.router,
    settings_router.router,
    live.router,
):
    app.include_router(router)
