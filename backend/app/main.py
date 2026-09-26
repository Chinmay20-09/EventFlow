"""EventFlow P3 backend application (FastAPI).

P3 owns API, persistence, validation, state management and integration
(EV-003 §2). It does not calculate crowd, prediction, optimization or
strategy results — those arrive from P1/P2 through validated inputs.
"""

from contextlib import asynccontextmanager

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
    events,
    health,
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
from app.db.session import get_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate configuration at startup, then ensure tables exist (EV-029 §11)."""
    validate_settings()
    engine = get_engine()
    Base.metadata.create_all(engine)
    # Add columns that create_all cannot add to existing tables (auth).
    run_startup_migrations(engine)
    yield


app = FastAPI(
    title="EventFlow P3 API",
    version="0.1.0",
    description="Backend / data / integration layer for the EventFlow MVP (P3).",
    lifespan=lifespan,
)

# Allow the P4 development frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
    crowd.router,
    p1.router,
    disruptions.router,
    predictions.router,
    strategy_sets.router,
    dashboard.router,
    alerts.router,
    settings_router.router,
):
    app.include_router(router)
