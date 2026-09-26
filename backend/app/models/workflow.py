"""Workflow entities (EV-005 §10–§15): StrategySet, Strategy,
SimulationResult, Approval, Execution.

State changes on StrategySet are made exclusively by
`app.services.workflow` (EV-015 §12).
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.core.utils import utcnow


class StrategySet(Base):
    """Main decision unit: strategies evaluated, simulated and decided together."""

    __tablename__ = "strategy_sets"

    strategy_set_id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PROPOSED", index=True
    )
    attempt_count: Mapped[int] = mapped_column(nullable=False, default=0)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Points at the stored SimulationResult (set by the workflow service).
    # A plain integer column avoids a circular foreign key between the two tables.
    simulation_result_id: Mapped[int | None] = mapped_column(nullable=True)
    approval_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Optional presentation metadata supplied by P2 (stored verbatim —
    # P3 never generates strategy names, descriptions or risk levels).
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    # The strategies belonging to this set (EV-005 §10–§11).
    strategies: Mapped[list["Strategy"]] = relationship("Strategy", lazy="selectin")


class Strategy(Base):
    """A single strategy inside a Strategy Set (EV-005 §11)."""

    __tablename__ = "strategies"

    strategy_id: Mapped[int] = mapped_column(primary_key=True)
    strategy_set_id: Mapped[int] = mapped_column(
        ForeignKey("strategy_sets.strategy_set_id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False
    )
    destination_node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    # Individual strategies have no independent lifecycle (EV-015 §2);
    # the default row status is a placeholder recorded in IMPLEMENTATION_NOTES.
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")


class SimulationResult(Base):
    """Stored output of one simulation attempt (EV-005 §13).

    Produced by P1 (or its marked mock adapter). This is simulation state and
    must never be treated as live operational state (EV-016 §13).
    """

    __tablename__ = "simulation_results"

    simulation_result_id: Mapped[int] = mapped_column(primary_key=True)
    strategy_set_id: Mapped[int] = mapped_column(
        ForeignKey("strategy_sets.strategy_set_id", ondelete="CASCADE"),
        nullable=False,
        # NOT unique: EV-015 §7 allows up to MAX_SIMULATION_ATTEMPTS (2)
        # attempts, each producing its own result row. The Strategy Set's
        # simulation_result_id pointer always references the latest result.
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SUCCESS")
    result_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    conflicts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Optional structured simulation outcome as supplied by P1 (mock-backed
    # until the real P1 engine confirms the shape — P3 never computes it).
    predicted_metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Verbatim P1 serializeSimulationResult payload (snake_case) ingested via
    # POST /api/internal/simulations. Stored as-is — including nulls — and
    # exposed only through the simulation-result endpoint (never live state).
    p1_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)


class Approval(Base):
    """Audit record of a Coordinator decision (EV-005 §14, EV-023 §8).

    `approved_by` always references the authenticated Coordinator resolved by
    the server — never a client-supplied string (EV-023 §4).
    """

    __tablename__ = "approvals"

    approval_id: Mapped[int] = mapped_column(primary_key=True)
    strategy_set_id: Mapped[int] = mapped_column(
        ForeignKey("strategy_sets.strategy_set_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    decision: Mapped[str] = mapped_column(String(20), nullable=False)  # APPROVED | REJECTED
    approved_by: Mapped[int] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class Execution(Base):
    """Execution lifecycle record for an approved Strategy Set (EV-005 §15)."""

    __tablename__ = "executions"

    execution_id: Mapped[int] = mapped_column(primary_key=True)
    # One execution per strategy set — supports the idempotency rule (EV-022 §11).
    strategy_set_id: Mapped[int] = mapped_column(
        ForeignKey("strategy_sets.strategy_set_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="EXECUTING")
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
