"""Settings endpoints for the P4 Settings screen (event-scoped only).

Implementation conflict (documented in IMPLEMENTATION_NOTES.md and the
EV-029 addendum): EV-029 §9 states no configuration dashboard is required
for the MVP, but the existing P4 frontend contains a Settings screen. These
endpoints expose only the four event-scoped values the screen edits —
backend environment/system configuration is never reachable through them.
"""

from fastapi import APIRouter

from app.api.deps import CurrentOperator, DbSession
from app.api.routes.events import get_event_or_404
from app.core.errors import ok
from app.schemas.settings import EventSettingsUpdate
from app.services.event_settings import get_effective_settings, settings_out, upsert_settings

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/events/{event_id}/settings")
def get_settings(event_id: int, db: DbSession) -> dict:
    """Return effective settings for one event (stored row or defaults).

    Readable without authentication (same as every other GET); defaults are
    returned until the organizer first saves.
    """
    event = get_event_or_404(db, event_id)
    return ok(settings_out(get_effective_settings(db, event)))


@router.put("/events/{event_id}/settings")
def update_settings(
    event_id: int,
    payload: EventSettingsUpdate,
    db: DbSession,
    operator: CurrentOperator,
) -> dict:
    """Partially update event-scoped settings.

    Requires an authenticated Organizer or Coordinator — Visitors are
    read-only (EV-023 §7). Only fields present in the body change;
    `event_name` updates the Event row itself (no duplicate storage).
    """
    event = get_event_or_404(db, event_id)
    return ok(upsert_settings(db, event, payload))
