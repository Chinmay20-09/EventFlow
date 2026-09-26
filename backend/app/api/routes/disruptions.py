"""Disruption endpoints (EV-016 §7, EV-037 §7; semantics follow EV-008)."""

from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.api.routes.events import get_event_or_404
from app.core.errors import AppError, ok
from app.db.session import commit_or_fail
from app.models.disruption import Disruption
from app.schemas.disruption import DisruptionCreate, DisruptionOut

router = APIRouter(prefix="/api", tags=["disruptions"])


def get_disruption_or_404(db: Session, disruption_id: int) -> Disruption:
    """Fetch a Disruption or raise the documented NOT_FOUND error."""
    disruption = db.get(Disruption, disruption_id)
    if disruption is None:
        raise AppError("NOT_FOUND", "Disruption not found", 404)
    return disruption


@router.post("/events/{event_id}/disruptions", status_code=status.HTTP_201_CREATED)
def create_disruption(event_id: int, payload: DisruptionCreate, db: DbSession) -> dict:
    """Record a disruption produced by an operational/external source (EV-016 §7).

    Validation happens before any write — invalid payloads are never stored.
    A disruption describes an operational condition, not a crowd condition
    (EV-005 §8).
    """
    get_event_or_404(db, event_id)
    disruption = Disruption(
        event_id=event_id,
        type=payload.type,
        severity=payload.severity,
        affected_nodes=payload.affected_nodes,
        affected_edges=payload.affected_edges,
        start_time=payload.start_time,
        expected_duration=payload.expected_duration,
        source=payload.source,
        status="ACTIVE",
    )
    db.add(disruption)
    commit_or_fail(db)
    return ok(DisruptionOut.model_validate(disruption))


@router.get("/events/{event_id}/disruptions")
def list_disruptions(
    event_id: int,
    db: DbSession,
    disruption_status: str | None = Query(default=None, alias="status"),
    disruption_type: str | None = Query(default=None, alias="type"),
) -> dict:
    """Return disruptions with the documented simple filters (EV-016 §7):

        ?status=ACTIVE&type=WEATHER_EVENT
    """
    get_event_or_404(db, event_id)
    query = select(Disruption).where(Disruption.event_id == event_id)
    if disruption_status:
        query = query.where(Disruption.status == disruption_status)
    if disruption_type:
        query = query.where(Disruption.type == disruption_type)
    disruptions = db.execute(query.order_by(Disruption.disruption_id)).scalars().all()
    return ok([DisruptionOut.model_validate(d) for d in disruptions])


@router.get("/disruptions/{disruption_id}")
def get_disruption(disruption_id: int, db: DbSession) -> dict:
    """Return one Disruption (EV-016 §7)."""
    disruption = get_disruption_or_404(db, disruption_id)
    return ok(DisruptionOut.model_validate(disruption))
