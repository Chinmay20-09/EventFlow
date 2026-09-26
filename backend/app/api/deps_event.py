"""Event-scoped authorization dependency (EV-023 - Security).

Responsibilities
----------------
1. Authenticate the caller (JWT bearer or the development ``X-User-Id``
   header — the existing identity mechanisms, no second auth system).
2. Look up the requested ``event_id`` and require it to exist (404 otherwise).
3. Verify the authenticated user is authorized for that event (403 otherwise):
   * ORGANIZER  — must be tied to the event through ``event_organizers``;
   * COORDINATOR — global operational role (approve/reject, settings writes);
     authorized for every existing event;
   * VISITOR    — never authorized for event-scoped WRITES; reads stay
     public per the existing convention (EV-016: all GETs unauthenticated).

Design notes
------------
* The frontend is never trusted to assert an ``event_id``. ``GET /api/auth/me``
  returns the *server-side* list of events an Organizer may manage; every
  event-scoped request re-validates through :func:`authorize_event`.
* No new authentication system: identity always comes from
  ``app.core.security.get_current_user``; the role is re-resolved from the
  stored ``users`` table on every request (never from the client).
* Path-segment event scoping: an authorized user for Event A requesting
  Event B gets 403 FORBIDDEN (User A → Event B is impossible unless bound).
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.event import Event, EventOrganizer
from app.models.user import ROLE_COORDINATOR, ROLE_ORGANIZER, User

__all__ = [
    "get_organizer_events",
    "authorize_event",
    "get_current_event",
    "require_event",
    "AuthorizedEvent",
    "EventWriteContext",
]


def select_authorized_event_ids(db: Session, user_id: int) -> set[int]:
    """Event ids the user owns through the ``event_organizers`` table.

    ``EventOrganizer`` is a pure association table (no ORM relationship
    attributes), so the query reads its FK columns directly — no join on a
    nonexistent ``.event`` relationship.
    """
    return set(
        db.execute(
            select(EventOrganizer.event_id).where(EventOrganizer.user_id == user_id)
        ).scalars().all()
    )


def get_organizer_events(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Event]:
    """Return the events this authenticated user is authorized to manage.

    Display only — never an authorization mechanism: every event-scoped
    request independently calls :func:`authorize_event`.
    """
    if user.role == ROLE_COORDINATOR:
        # Global operational role: not an event owner through event_organizers.
        return []
    if user.role == ROLE_ORGANIZER:
        ids = select_authorized_event_ids(db, user.user_id)
        if not ids:
            return []
        return list(
            db.execute(select(Event).where(Event.event_id.in_(ids)).order_by(Event.event_id))
            .scalars()
            .all()
        )
    # VISITOR (and anything else unexpected) is never authorized for an event.
    return []


def authorize_event(
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Event:
    """Validate that ``event_id`` exists and the caller is authorized for it.

    Returns the validated ``Event`` (never a raw id), or raises the documented
    error envelope codes:

    * 401 UNAUTHORIZED — no/unknown identity (resolved by get_current_user)
    * 403 FORBIDDEN    — caller not bound to this event (Organizer), or a
                         Visitor (Visitors are read-only, EV-023 §7)
    * 404 NOT_FOUND    — the event does not exist
    """
    event = db.get(Event, event_id)
    if event is None:
        raise AppError("NOT_FOUND", "Event not found", 404)

    if user.role == ROLE_COORDINATOR:
        return event

    if user.role == ROLE_ORGANIZER:
        if event.event_id in select_authorized_event_ids(db, user.user_id):
            return event
        raise AppError(
            "FORBIDDEN",
            "This event is not in your authorized events",
            403,
        )

    raise AppError("FORBIDDEN", "Visitors cannot modify events", 403)


# Historical alias kept so earlier imports keep working.
get_current_event = authorize_event
require_event = authorize_event

# Validated, authorized Event context for a single event-scoped request.
AuthorizedEvent = Annotated[Event, Depends(authorize_event)]


class EventWriteContext:
    """Event + authenticated user for event-scoped WRITES (EV-023 §7).

    Writers must be an authorized Organizer (bound through event_organizers)
    or a Coordinator. Visitors are rejected with 403.
    """

    def __init__(self, event: Event, user: User):
        self.event = event
        self.user = user


def get_event_write_context(
    event: Annotated[Event, Depends(authorize_event)],
    user: Annotated[User, Depends(get_current_user)],
) -> EventWriteContext:
    """Compose the write context (authorize_event already enforced the role)."""
    return EventWriteContext(event=event, user=user)


EventWrite = Annotated[EventWriteContext, Depends(get_event_write_context)]
