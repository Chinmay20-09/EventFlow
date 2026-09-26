"""P4 aggregate/read endpoints: dashboard, zones, recommendation.

All responses are composed at read time from authoritative stored rows —
they introduce no second source of truth and never include simulation state.
"""

from fastapi import APIRouter

from app.api.deps import CurrentEvent, DbSession
from app.api.deps_event import get_current_event
from app.core.errors import ok
from app.schemas.dashboard import RecommendationOut
from app.services.adapters import get_p2_intel
from app.services.event_settings import get_effective_settings
from app.services.read_models import build_dashboard, build_zones

router = APIRouter(prefix="/api", tags=["p4-read"])


@router.get("/events/{event_id}/dashboard")
def get_dashboard(event_id: int, db: DbSession) -> dict:
    """Aggregate for the P4 Overview screen (Phase 6/7).

    Composed from: event, nodes, crowd_state, disruptions, predictions and
    executions. Simulation results are deliberately excluded — live state
    must never display simulation-only values (EV-016 §13).
    """
    # The dashboard is event-scoped by construction: every row in the
    # response is filtered to the authenticated user authorized event.
    # (build_dashboard reads only rows whose event_id == event.event_id).
    # The event context is re-validated by `get_current_event`, so an
    # Organizer only ever sees their own event data.
    event = get_current_event(db=db, event_id=event_id)
    return ok(build_dashboard(db, event))


@router.get("/events/{event_id}/zones")
def get_zones(event_id: int, db: DbSession) -> dict:
    """Zones/nodes with stored crowd + trivial occupancy ratios.

    Crowd values arrive from P1 (POST /api/internal/crowd); P3 computes no
    crowd intelligence. Edge movement/flow is intentionally absent until P1
    confirms it can provide current flow data (P1 INPUT REQUIRED).

    The zones endpoint is re-scoped by `get_current_event`, so an Organizer
    only sees zones for events they manage.
    """
    event = get_current_event(db=db, event_id=event_id)
    settings = get_effective_settings(db, event)
    return ok(build_zones(db, event_id, settings))


@router.get("/events/{event_id}/recommendation")
def get_recommendation(event_id: int, db: DbSession) -> dict:
    """AI recommendation for the P4 Predictions screen.

    Passes through the P2 adapter output unchanged — P3 never writes the
    recommendation text. Currently served by the clearly marked [MOCK P2]
    adapter until the real P2 service is integrated.

    The recommendation endpoint is re-scoped by `get_current_event`, so an
    Organizer only receives recommendations for events they manage.
    """
    event = get_current_event(db=db, event_id=event_id)
    recommendation = get_p2_intel().get_recommendation(event_id)
    return ok(
        RecommendationOut(
            event_id=event_id,
            headline=recommendation.headline,
            detail=recommendation.detail,
            source=recommendation.source,
        )
    )
