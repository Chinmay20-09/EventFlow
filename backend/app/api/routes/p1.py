"""P1 → P3 ingestion endpoints (crowd engine integration).

P1 is a pure TypeScript library (no HTTP layer) whose explicit P3-facing
serializers in `src/engine/serialization.ts` define the snake_case wire
format. These routes are the push boundary that receives those payloads:

  POST /api/internal/crowd-state    current crowd snapshot (serializeMetric)
  POST /api/internal/simulations    simulation result (serializeSimulationResult)

P3 validates, persists and exposes the P1 values — it never recalculates
crowd count, occupancy, density, flow, queues, bottlenecks or travel time,
never invents simulation results, never approves or executes anything
(EV-003 §10, EV-016 §20). Missing values stay null, zero stays zero, and
P1 string IDs are preserved (mapped through `nodes.external_id`).
"""

from datetime import timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.api.deps import DbSession
from app.api.routes.events import get_event_or_404
from app.core.errors import AppError, ok
from app.core.security import verify_p1_api_key
from app.db.session import commit_or_fail
from app.models.crowd import CrowdState
from app.models.graph import Node
from app.schemas.crowd import CrowdOut
from app.schemas.p1 import P1CapacityMetric, P1CrowdStateIn, P1SimulationIn
from app.schemas.strategy import SimulationStartOut
from app.services import workflow
from app.utils import utcnow

router = APIRouter(prefix="/api", tags=["p1-integration"], dependencies=[Depends(verify_p1_api_key)])


def _resolve_p1_node(db, event_id: int, p1_node_id: str) -> Node | None:
    """Map a P1 string node ID to a P3 node of the event.

    Resolution order (documented in IMPLEMENTATION_NOTES §7):
      1. exact `nodes.external_id` match within the event (explicit mapping),
      2. all-digit ID treated as the P3 integer `node_id` (P1 accepts any
         string IDs, so P3 IDs may be used directly by P1).
    """
    node = db.execute(
        select(Node).where(Node.event_id == event_id, Node.external_id == p1_node_id)
    ).scalar_one_or_none()
    if node is not None:
        return node
    if p1_node_id.isdigit():
        candidate = db.get(Node, int(p1_node_id))
        if candidate is not None and candidate.event_id == event_id:
            return candidate
    return None


@router.post("/internal/crowd-state", status_code=status.HTTP_201_CREATED)
def ingest_p1_crowd_state(payload: P1CrowdStateIn, db: DbSession) -> dict:
    """P1 → P3 current crowd-state snapshot (all-or-nothing upsert).

    Each entry of `metrics` is a P1 `CapacityMetric` stored verbatim in
    `crowd_state.p1_metric`; `current_crowd` is a direct copy of P1's
    `current_occupancy` (field mapping, never a calculation). The whole
    payload is validated before anything is written: an unknown or duplicate
    P1 node ID rejects the request and stores nothing (EV-024 §5).
    Duplicates of the whole snapshot are last-write-wins on the single
    current row per node — never a second row, never double-counted
    (EV-005 §7).
    """
    event = get_event_or_404(db, payload.event_id)

    # Phase 1 — resolve and validate every reference before any write.
    resolved: list[tuple[Node, P1CapacityMetric]] = []
    seen: set[int] = set()
    for metric in payload.metrics:
        node = _resolve_p1_node(db, event.event_id, metric.id)
        if node is None:
            raise AppError(
                "VALIDATION_ERROR",
                f"P1 node id {metric.id!r} does not map to a node of event {event.event_id}",
                422,
            )
        if node.node_id in seen:
            raise AppError(
                "VALIDATION_ERROR",
                f"Duplicate P1 node id {metric.id!r} in payload",
                422,
            )
        seen.add(node.node_id)
        resolved.append((node, metric))

    updated_at = payload.timestamp
    if updated_at is not None and updated_at.tzinfo is not None:
        updated_at = updated_at.astimezone(timezone.utc).replace(tzinfo=None)
    if updated_at is None:
        updated_at = utcnow()

    # Phase 2 — upsert the single current row per node (EV-005 §7).
    stored: list[CrowdState] = []
    for node, metric in resolved:
        row = db.execute(
            select(CrowdState).where(CrowdState.node_id == node.node_id)
        ).scalar_one_or_none()
        if row is None:
            row = CrowdState(node_id=node.node_id)
            db.add(row)
        # Direct copy of the P1 value — P3 never computes crowd state.
        row.current_crowd = metric.current_occupancy
        row.p1_metric = metric.model_dump()
        row.updated_at = updated_at
        stored.append(row)

    commit_or_fail(db)
    return ok([CrowdOut.model_validate(row) for row in stored])


@router.post("/internal/simulations", status_code=status.HTTP_201_CREATED)
def ingest_p1_simulation(payload: P1SimulationIn, db: DbSession) -> dict:
    """P1 → P3 simulation-result ingestion.

    The full `serializeSimulationResult` payload is validated against the
    P1 contract, stored verbatim (`simulation_results.p1_result`) and linked
    to the Strategy Set through the single workflow state machine — same
    attempt limit, no auto-approval, no execution. Simulation data is served
    only by `GET /api/strategy-sets/{id}/simulation`; live endpoints never
    include it (EV-016 §13).

    Re-delivering the same P1 result id is idempotent: the stored row is
    returned unchanged and no extra simulation attempt is consumed.
    """
    strategy_set, result, duplicate = workflow.record_external_simulation(
        db, payload.strategy_set_id, p1_payload=payload.result.model_dump()
    )
    body = SimulationStartOut(
        strategy_set_id=strategy_set.strategy_set_id,
        simulation_result_id=result.simulation_result_id,
        status=strategy_set.status,
    ).model_dump()
    body["duplicate"] = duplicate
    return ok(body)
