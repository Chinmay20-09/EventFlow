"""Strategy Set, simulation, approval and execution schemas
(EV-016 §9–§12, EV-037 §9–§13, §17).
"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import OrmModel


class StrategyItemCreate(BaseModel):
    source_node_id: int
    destination_node_id: int
    action: str = Field(min_length=1, max_length=60)

    model_config = {"extra": "forbid"}


class StrategySetCreate(BaseModel):
    strategies: list[StrategyItemCreate] = Field(min_length=1)
    # Optional P2-supplied presentation metadata — stored verbatim; P3 never
    # generates names, descriptions or risk levels.
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    risk_level: str | None = Field(default=None, max_length=30)

    model_config = {"extra": "forbid"}


class StrategyOut(BaseModel, OrmModel):
    strategy_id: int
    source_node_id: int
    destination_node_id: int
    action: str
    status: str


class StrategySetOut(BaseModel, OrmModel):
    strategy_set_id: int
    event_id: int
    status: str
    attempt_count: int
    simulation_result_id: int | None = None
    approval_status: str | None = None
    failure_reason: str | None = None
    name: str | None = None
    description: str | None = None
    risk_level: str | None = None
    created_at: datetime
    strategies: list[StrategyOut] = []


class SimulationStartOut(BaseModel):
    strategy_set_id: int
    simulation_result_id: int
    status: str  # SIMULATED on success (EV-037 §10)


class SimulationResultOut(BaseModel, OrmModel):
    simulation_result_id: int
    strategy_set_id: int
    status: str
    result_summary: str
    conflicts: list = []
    # Structured P1 outcome (mock-backed until P1 confirms the shape).
    predicted_metrics: dict | None = None
    created_at: datetime


class ApproveRequest(BaseModel):
    """Deliberately empty: identity comes from the server, never the body (EV-023 §4)."""

    model_config = {"extra": "forbid"}


class RejectRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)

    model_config = {"extra": "forbid"}


class ApprovalOut(BaseModel, OrmModel):
    approval_id: int
    strategy_set_id: int
    decision: str
    approved_by: int
    created_at: datetime
    reason: str | None = None


class ApprovalActionOut(BaseModel):
    strategy_set_id: int
    status: str
    execution_triggered: bool = False


class RejectionOut(BaseModel):
    strategy_set_id: int
    status: str


class ExecutionOut(BaseModel, OrmModel):
    execution_id: int
    strategy_set_id: int
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    failure_reason: str | None = None
