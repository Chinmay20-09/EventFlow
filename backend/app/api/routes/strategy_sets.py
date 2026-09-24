"""Strategy Set workflow endpoints (EV-016 §9–§12, EV-037 §9–§13).

Route handlers validate input and delegate every state change to
`app.services.workflow` — handlers never touch workflow state directly
(EV-015 §12). There is deliberately no `/execute` endpoint and no generic
PATCH or hard-delete endpoint (EV-016 §16–§17).
"""

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentCoordinator, DbSession
from app.api.routes.events import get_event_or_404
from app.core.errors import AppError, ok
from app.db.session import commit_or_fail
from app.models.graph import Node
from app.models.workflow import SimulationResult, Strategy, StrategySet
from app.schemas.strategy import (
    ApprovalActionOut,
    ApproveRequest,
    ExecutionOut,
    RejectionOut,
    RejectRequest,
    SimulationResultOut,
    SimulationStartOut,
    StrategySetCreate,
    StrategySetOut,
)
from app.services import workflow

router = APIRouter(prefix="/api", tags=["strategy-sets"])


def _strategy_set_out(strategy_set: StrategySet) -> StrategySetOut:
    return StrategySetOut.model_validate(strategy_set)


@router.post("/events/{event_id}/strategy-sets", status_code=status.HTTP_201_CREATED)
def create_strategy_set(event_id: int, payload: StrategySetCreate, db: DbSession) -> dict:
    """Create a Strategy Set from P2-produced strategies (EV-016 §9, EV-037 §9).

    Every referenced node must exist and belong to the event — validation
    happens before anything is stored.
    """
    get_event_or_404(db, event_id)

    event_node_ids = {
        node_id
        for (node_id,) in db.execute(
            select(Node.node_id).where(Node.event_id == event_id)
        ).all()
    }

    for item in payload.strategies:
        if item.source_node_id not in event_node_ids:
            raise AppError(
                "VALIDATION_ERROR",
                f"source_node_id {item.source_node_id} does not belong to this event",
                422,
            )
        if item.destination_node_id not in event_node_ids:
            raise AppError(
                "VALIDATION_ERROR",
                f"destination_node_id {item.destination_node_id} does not belong to this event",
                422,
            )

    strategy_set = StrategySet(
        event_id=event_id,
        status="PROPOSED",
        # Optional P2-supplied metadata, stored verbatim (P3 never generates it).
        name=payload.name,
        description=payload.description,
        risk_level=payload.risk_level,
    )
    db.add(strategy_set)
    db.flush()  # assign strategy_set_id

    for item in payload.strategies:
        db.add(
            Strategy(
                strategy_set_id=strategy_set.strategy_set_id,
                source_node_id=item.source_node_id,
                destination_node_id=item.destination_node_id,
                action=item.action,
            )
        )
    commit_or_fail(db)

    strategy_set = workflow.get_strategy_set_or_404(db, strategy_set.strategy_set_id)
    return ok(_strategy_set_out(strategy_set))


@router.get("/events/{event_id}/strategy-sets")
def list_strategy_sets(event_id: int, db: DbSession) -> dict:
    """Return the Strategy Sets of an Event (EV-016 §9)."""
    get_event_or_404(db, event_id)
    strategy_sets = db.execute(
        select(StrategySet)
        .where(StrategySet.event_id == event_id)
        .order_by(StrategySet.strategy_set_id)
    ).scalars().all()
    return ok([_strategy_set_out(s) for s in strategy_sets])


@router.get("/strategy-sets/{strategy_set_id}")
def get_strategy_set(strategy_set_id: int, db: DbSession) -> dict:
    """Return one Strategy Set with its strategies (EV-016 §9)."""
    strategy_set = workflow.get_strategy_set_or_404(db, strategy_set_id)
    return ok(_strategy_set_out(strategy_set))


@router.post("/strategy-sets/{strategy_set_id}/simulate")
def simulate_strategy_set(strategy_set_id: int, db: DbSession) -> dict:
    """Run the simulation workflow for a Strategy Set (EV-016 §10).

    Delegates to the workflow service, which enforces the state machine and
    the MAX_SIMULATION_ATTEMPTS limit. Simulation never auto-approves and the
    result is stored separately from live state.
    """
    strategy_set, result = workflow.request_simulation(db, strategy_set_id)
    return ok(
        SimulationStartOut(
            strategy_set_id=strategy_set.strategy_set_id,
            simulation_result_id=result.simulation_result_id,
            status=strategy_set.status,
        )
    )


@router.get("/strategy-sets/{strategy_set_id}/simulation")
def get_simulation_result(strategy_set_id: int, db: DbSession) -> dict:
    """Return the stored simulation result (EV-016 §10, EV-005 §13).

    This is simulation state and is served only from this endpoint — the
    live event-state endpoint never returns it.
    """
    strategy_set = workflow.get_strategy_set_or_404(db, strategy_set_id)
    if strategy_set.simulation_result_id is None:
        raise AppError("NOT_FOUND", "Simulation result not found", 404)

    result = db.get(SimulationResult, strategy_set.simulation_result_id)
    if result is None:
        raise AppError("NOT_FOUND", "Simulation result not found", 404)
    return ok(SimulationResultOut.model_validate(result))


@router.post("/strategy-sets/{strategy_set_id}/approve")
def approve_strategy_set(
    strategy_set_id: int,
    db: DbSession,
    coordinator: CurrentCoordinator,
    payload: ApproveRequest | None = None,  # deliberately empty — identity is server-side
) -> dict:
    """Coordinator approves a SIMULATED Strategy Set (EV-016 §11, EV-023 §5).

    Requires an authenticated Coordinator. Records the approval, moves the
    set to APPROVED and automatically triggers the execution workflow.
    There is no separate /execute action (EV-016 §12). The response reports
    the decision exactly as documented in EV-037 §11.
    """
    strategy_set, triggered = workflow.approve(db, strategy_set_id, coordinator)
    return ok(
        ApprovalActionOut(
            strategy_set_id=strategy_set.strategy_set_id,
            status="APPROVED",
            execution_triggered=triggered,
        )
    )


@router.post("/strategy-sets/{strategy_set_id}/reject")
def reject_strategy_set(
    strategy_set_id: int,
    db: DbSession,
    coordinator: CurrentCoordinator,
    payload: RejectRequest | None = None,
) -> dict:
    """Coordinator rejects a SIMULATED Strategy Set (EV-016 §11, EV-022 §4)."""
    reason = payload.reason if payload else None
    strategy_set = workflow.reject(db, strategy_set_id, coordinator, reason)
    return ok(
        RejectionOut(
            strategy_set_id=strategy_set.strategy_set_id,
            status=strategy_set.status,
        )
    )


@router.get("/strategy-sets/{strategy_set_id}/execution")
def get_execution(strategy_set_id: int, db: DbSession) -> dict:
    """Return the execution status for a Strategy Set (EV-037 §13)."""
    from app.models.workflow import Execution

    strategy_set = workflow.get_strategy_set_or_404(db, strategy_set_id)
    execution = db.execute(
        select(Execution).where(Execution.strategy_set_id == strategy_set_id)
    ).scalar_one_or_none()
    if execution is None:
        raise AppError("NOT_FOUND", "Execution not found", 404)
    return ok(ExecutionOut.model_validate(execution))
