"""Crowd endpoint (EV-016 §6, EV-037 §6).

P3 returns the stored current crowd state for a node. P3 does not calculate
crowd state (EV-016 §6, EV-003 §10).
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.api.deps import DbSession
from app.api.routes.events import get_event_or_404
from app.core.errors import AppError, ok
from app.core.security import verify_p1_api_key
from app.db.session import commit_or_fail
from app.models.crowd import CrowdState
from app.schemas.crowd import CrowdIngestIn, CrowdOut
from app.api.routes.nodes import get_node_or_404
from app.core.utils import utcnow

router = APIRouter(prefix="/api", tags=["crowd"])


@router.get("/nodes/{node_id}/crowd")
def get_node_crowd(node_id: int, db: DbSession) -> dict:
    """Latest stored crowd state for one node (current state, not history)."""
    get_node_or_404(db, node_id)

    row = db.query(CrowdState).filter(CrowdState.node_id == node_id).one_or_none()
    if row is None:
        raise AppError("NOT_FOUND", "Crowd state not found", 404)
    return ok(CrowdOut.model_validate(row))


def ingest_crowd(payload: CrowdIngestIn, db: DbSession) -> dict:
    """P1 → P3 current crowd-state ingestion (EV-016 §14 /api/internal/crowd).

    P1 calculates the crowd state; P3 validates and stores the single
    current row per node (EV-016 §6, EV-020 §4). Duplicate submissions are
    idempotent last-write-wins upserts — never a second row. Graph capacity
    is never modified by crowd data (EV-020 §5).

    Machine-to-machine P1 boundary: authenticated by the shared P3_API_KEY
    (verify_p1_api_key on the router), not by user identity — event-scoped
    USER authorization does not apply here. The event must exist and the
    node must belong to it.
    """
    event = get_event_or_404(db, payload.event_id)
    node = get_node_or_404(db, payload.node_id)
    if node.event_id != event.event_id:
        raise AppError(
            "VALIDATION_ERROR",
            f"node_id {payload.node_id} does not belong to event {payload.event_id}",
            422,
        )

    row = db.execute(
        select(CrowdState).where(CrowdState.node_id == node.node_id)
    ).scalar_one_or_none()

    updated_at = payload.timestamp
    if updated_at is not None and updated_at.tzinfo is not None:
        from datetime import timezone

        updated_at = updated_at.astimezone(timezone.utc).replace(tzinfo=None)
    if updated_at is None:
        updated_at = utcnow()

    if row is None:
        row = CrowdState(node_id=node.node_id, current_crowd=payload.current_crowd)
        db.add(row)
    else:
        row.current_crowd = payload.current_crowd
    row.updated_at = updated_at

    commit_or_fail(db)
    return ok(CrowdOut.model_validate(row))


# P1 service boundary — registered with the shared P3_API_KEY dependency the
# endpoint has always documented. (It was reachable unauthenticated only while
# P3_API_KEY was empty, which disables verify_p1_api_key.) Registered after the
# function definition; kept include_in_schema=False so the generated OpenAPI
# contract is unchanged.
router.add_api_route(
    "/internal/crowd",
    ingest_crowd,
    methods=["POST"],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_p1_api_key)],
    include_in_schema=False,
)
