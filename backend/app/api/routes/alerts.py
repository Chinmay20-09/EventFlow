"""Alert and timeline endpoints for P4 (read-time composition only).

No `alerts` or `activity_log` table exists: both endpoints compose their
lists from stored disruptions, crowd state, predictions, simulation
results, approvals and executions at request time. Removing an underlying
row removes its entry — nothing is persisted or invented here.
"""

from fastapi import APIRouter

from app.api.deps import DbSession
from app.api.routes.events import get_event_or_404
from app.core.errors import ok
from app.services.event_settings import get_effective_settings
from app.services.read_models import build_alerts, build_timeline

router = APIRouter(prefix="/api", tags=["p4-read"])


@router.get("/events/{event_id}/alerts")
def get_alerts(event_id: int, db: DbSession) -> dict:
    """Predictive Alerts list + notification badge source for P4.

    Sources: ACTIVE disruptions (stored severity verbatim), stored crowd at
    or above the stored threshold, and — when the organizer enabled auto AI
    alerts — stored predictions at or above the threshold. P3 generates no
    prediction and no AI alert; it only compares stored values at read time.

    The event context is re-validated by `get_current_event`: an Organizer may
    only read alerts for events they manage; a Coordinator may read every
    event. The `event_id` in the path is the request-scoped reference — the
    caller must be authorized for it.
    """
    event = get_event_or_404(db, event_id)
    settings = get_effective_settings(db, event)
    return ok(build_alerts(db, event_id, settings))


@router.get("/events/{event_id}/timeline")
def get_timeline(event_id: int, db: DbSession) -> dict:
    """Activity timeline for P4 — factual entries composed from stored rows.

    Entries exist only for rows that exist (disruptions, simulation results,
    approvals, executions). The timeline never invents activity.

    The event context is re-validated by `get_current_event`: an Organizer may
    only read the timeline for events they manage; a Coordinator may read
    every event. The `event_id` in the path is the request-scoped reference —
    the caller must be authorized for it.
    """
    event = get_event_or_404(db, event_id)
    return ok(build_timeline(db, event_id))
