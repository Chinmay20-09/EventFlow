"""The single Strategy Set state machine (EV-015).

Every workflow state change goes through this module — route handlers never
mutate `StrategySet.status` directly (EV-015 §12). Transitions use database
transactions so multi-write operations are atomic (EV-024 §14).
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.db.session import commit_or_fail
from app.models.user import ROLE_COORDINATOR, User
from app.models.workflow import Approval, Execution, SimulationResult, StrategySet
from app.services.adapters import get_p1_engine, get_p5_ops
from app.utils import utcnow

logger = logging.getLogger("eventflow.p3")

# Allowed transitions per EV-015 §4–§6. No STALE state exists (EV-015 §8).
# - SIMULATED → SIMULATING: re-simulation is explicitly allowed (EV-015 §8).
# - FAILED → SIMULATING: permitted retry / revised candidate (EV-015 §11).
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "PROPOSED": {"SIMULATING"},
    "SIMULATING": {"SIMULATED", "FAILED"},
    "SIMULATED": {"APPROVED", "REJECTED", "SIMULATING"},
    "APPROVED": {"EXECUTING"},
    "EXECUTING": {"COMPLETED", "FAILED"},
    "FAILED": {"SIMULATING"},
    "COMPLETED": set(),
    "REJECTED": set(),
}

TERMINAL_STATES = {"COMPLETED", "REJECTED"}


def get_strategy_set_or_404(db: Session, strategy_set_id: int) -> StrategySet:
    """Fetch a Strategy Set or raise the documented NOT_FOUND error (EV-024 §6)."""
    strategy_set = db.get(StrategySet, strategy_set_id)
    if strategy_set is None:
        raise AppError("NOT_FOUND", "Strategy set not found", 404)
    return strategy_set


def _transition(strategy_set: StrategySet, target: str) -> None:
    """Apply one state change or reject it with INVALID_STATE (EV-015 §9).

    This is the ONLY place workflow state is written.
    """
    allowed = ALLOWED_TRANSITIONS.get(strategy_set.status, set())
    if target not in allowed:
        raise AppError(
            "INVALID_STATE",
            f"Cannot transition from {strategy_set.status} to {target}",
            409,
        )
    strategy_set.status = target


def request_simulation(db: Session, strategy_set_id: int) -> tuple[StrategySet, SimulationResult]:
    """PROPOSED/FAILED/SIMULATED → SIMULATING → SIMULATED | FAILED (EV-015 §6).

    Enforces MAX_SIMULATION_ATTEMPTS (default 2). A third attempt is rejected
    with INVALID_STATE. Simulation never auto-approves anything and its result
    is stored separately from live state.
    """
    strategy_set = get_strategy_set_or_404(db, strategy_set_id)

    # Attempt-limit check happens before any state mutation (EV-015 §7).
    if strategy_set.attempt_count >= settings.max_simulation_attempts:
        raise AppError(
            "INVALID_STATE",
            f"Maximum simulation attempts reached ({settings.max_simulation_attempts})",
            409,
        )

    # Record SIMULATING first so the attempt state is visible while processing.
    _transition(strategy_set, "SIMULATING")
    commit_or_fail(db)

    strategies = [
        {
            "source_node_id": s.source_node_id,
            "destination_node_id": s.destination_node_id,
            "action": s.action,
        }
        for s in strategy_set.strategies
    ]

    try:
        outcome = get_p1_engine().run_simulation(strategy_set.strategy_set_id, strategies)
    except Exception as exc:  # upstream simulation failure (EV-024 §10)
        logger.exception("Simulation failed for strategy set %s", strategy_set.strategy_set_id)
        strategy_set.attempt_count += 1
        strategy_set.failure_reason = "Simulation attempt failed"
        _transition(strategy_set, "FAILED")
        commit_or_fail(db)
        raise AppError("INTERNAL_ERROR", "Simulation failed", 500) from exc

    result = SimulationResult(
        strategy_set_id=strategy_set.strategy_set_id,
        status=outcome.status,
        result_summary=outcome.result_summary,
        conflicts=outcome.conflicts,
        predicted_metrics=outcome.predicted_metrics,
    )
    db.add(result)
    db.flush()  # assign simulation_result_id

    strategy_set.simulation_result_id = result.simulation_result_id
    strategy_set.attempt_count += 1
    strategy_set.failure_reason = None
    _transition(strategy_set, "SIMULATED")
    commit_or_fail(db)

    return strategy_set, result


def approve(
    db: Session, strategy_set_id: int, coordinator: User
) -> tuple[StrategySet, bool]:
    """SIMULATED → APPROVED → EXECUTING (EV-022 §3/§5).

    Coordinator-only. Records the Approval with the server-resolved identity,
    commits approval + state together, then triggers the (mock) P5 execution
    workflow. No `/execute` endpoint exists and there is no automatic retry.
    """
    # Defence in depth: verify the role here as well as in the API dependency.
    if coordinator.role != ROLE_COORDINATOR:
        raise AppError("FORBIDDEN", "Coordinator role required for this action", 403)

    strategy_set = get_strategy_set_or_404(db, strategy_set_id)

    if strategy_set.status != "SIMULATED":
        raise AppError(
            "INVALID_STATE",
            "Only a simulated strategy set can be approved",
            409,
        )

    # `approved_by` is the authenticated user — never a client-supplied string.
    approval = Approval(
        strategy_set_id=strategy_set.strategy_set_id,
        decision="APPROVED",
        approved_by=coordinator.user_id,
    )
    db.add(approval)
    strategy_set.approval_status = "APPROVED"
    _transition(strategy_set, "APPROVED")
    # EV-024 §14: approval record + state change commit in one transaction.
    commit_or_fail(db)

    # Idempotent automatic execution trigger (EV-022 §5/§11).
    if strategy_set.status in ("EXECUTING", "COMPLETED"):
        return strategy_set, False

    try:
        trigger = get_p5_ops().trigger_execution(strategy_set.strategy_set_id)
    except Exception as exc:
        # No automatic retry (EV-024 §12); the approval itself already stands.
        logger.exception("Execution trigger failed for strategy set %s", strategy_set_id)
        raise AppError(
            "INTERNAL_ERROR",
            "Execution trigger failed; the strategy set remains APPROVED",
            500,
        ) from exc

    if not trigger.success:
        raise AppError(
            "INTERNAL_ERROR",
            "Execution trigger failed; the strategy set remains APPROVED",
            500,
        )

    execution = Execution(
        strategy_set_id=strategy_set.strategy_set_id,
        status="EXECUTING",
        started_at=utcnow(),
    )
    db.add(execution)
    _transition(strategy_set, "EXECUTING")
    commit_or_fail(db)

    return strategy_set, True


def reject(db: Session, strategy_set_id: int, coordinator: User, reason: str | None) -> StrategySet:
    """SIMULATED → REJECTED (EV-015 §5/§6, EV-022 §4). Coordinator-only."""
    if coordinator.role != ROLE_COORDINATOR:
        raise AppError("FORBIDDEN", "Coordinator role required for this action", 403)

    strategy_set = get_strategy_set_or_404(db, strategy_set_id)

    if strategy_set.status != "SIMULATED":
        raise AppError(
            "INVALID_STATE",
            "Only a simulated strategy set can be rejected",
            409,
        )

    approval = Approval(
        strategy_set_id=strategy_set.strategy_set_id,
        decision="REJECTED",
        approved_by=coordinator.user_id,
        reason=reason,
    )
    db.add(approval)
    strategy_set.approval_status = "REJECTED"
    _transition(strategy_set, "REJECTED")
    commit_or_fail(db)
    return strategy_set


def _get_execution_or_fail(db: Session, strategy_set: StrategySet) -> Execution:
    execution = db.execute(
        select(Execution).where(Execution.strategy_set_id == strategy_set.strategy_set_id)
    ).scalar_one_or_none()
    if execution is None:
        raise AppError("NOT_FOUND", "Execution not found", 404)
    return execution


def complete_execution(db: Session, strategy_set_id: int) -> StrategySet:
    """EXECUTING → COMPLETED (EV-015 §6, EV-022 §9).

    Called when the operational layer reports success. Not exposed as a
    user-facing endpoint — no such endpoint is documented for the MVP.
    """
    strategy_set = get_strategy_set_or_404(db, strategy_set_id)
    # State validation first: PROPOSED/REJECTED/... → COMPLETED is invalid (EV-015 §9).
    _transition(strategy_set, "COMPLETED")
    execution = _get_execution_or_fail(db, strategy_set)

    execution.status = "COMPLETED"
    execution.completed_at = utcnow()
    commit_or_fail(db)
    return strategy_set


def fail_execution(db: Session, strategy_set_id: int, reason: str) -> StrategySet:
    """EXECUTING → FAILED (EV-015 §6, EV-022 §10). Stores the failure reason.

    The MVP never retries automatically (EV-024 §12).
    """
    strategy_set = get_strategy_set_or_404(db, strategy_set_id)
    # State validation first: only EXECUTING may fail (EV-015 §6/§9).
    _transition(strategy_set, "FAILED")
    execution = _get_execution_or_fail(db, strategy_set)

    execution.status = "FAILED"
    execution.completed_at = utcnow()
    execution.failure_reason = reason
    strategy_set.failure_reason = reason
    commit_or_fail(db)
    return strategy_set
