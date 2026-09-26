"""Shared dependency aliases used by the route modules."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_coordinator, get_current_operator, get_current_user
from app.db.session import get_db
from app.models.user import User

# Database session for one request.
DbSession = Annotated[Session, Depends(get_db)]

# Authenticated user (any role) via the development identity header.
CurrentUser = Annotated[User, Depends(get_current_user)]

# Authenticated Coordinator — required for approve/reject (EV-023 §5).
CurrentCoordinator = Annotated[User, Depends(get_current_coordinator)]

# Authenticated Organizer or Coordinator — required for settings writes.
CurrentOperator = Annotated[User, Depends(get_current_operator)]

# Event-scoped dependencies (EV-023 — Security; task Phases 4-6).
from app.api.deps_event import get_organizer_events, get_current_event
from app.models.event import Event



# Events the authenticated user may manage (server-side only; never trusted by
# the client — see get_current_event for the real per-request authorization).
AuthorizedEvents = Annotated[list[Event], Depends(get_organizer_events)]

# Validated, authorized Event context for a single event-scoped request.
CurrentEvent = Annotated[Event, Depends(get_current_event)]
