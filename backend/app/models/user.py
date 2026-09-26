"""User entity with the three MVP roles (EV-023 §2)."""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.core.utils import utcnow

ROLE_ORGANIZER = "ORGANIZER"
ROLE_COORDINATOR = "COORDINATOR"
ROLE_VISITOR = "VISITOR"
VALID_ROLES = {ROLE_ORGANIZER, ROLE_COORDINATOR, ROLE_VISITOR}


class User(Base):
    """An MVP user. Role is provisioned out-of-band; identity comes from auth."""

    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    # The events this user owns. An Organizer may manage many events; each
    # Event is owned through the event_organizers association table, never
    # stored as a single event_id column on the User row.
    events: Mapped[list["Event"]] = relationship(
        "Event",
        secondary="event_organizers",
        back_populates="organizers",
        lazy="selectin",
    )

