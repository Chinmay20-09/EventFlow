"""P1 Crowd Engine payload schemas (contract: Crowd-Engine `engine/src/serialization.ts`).

P1's explicit P3-facing serializers emit snake_case JSON:
  - `serializeMetric`          -> P1CapacityMetric
  - `serializeSimulationResult` -> P1SimulationResult (+ nested models)

These schemas validate the exact wire shape and NOTHING else — P3 stores
the values verbatim (nulls stay null, zero stays zero, P1 IDs unchanged).
P3 never recalculates crowd count, occupancy, density, flow, queues,
bottlenecks, travel time or any simulation metric (EV-003 §10, EV-016 §20).

Notes on typing:
- P1 "number" fields accept `int | float` so integer JSON values round-trip
  as integers and fractional values as floats — no value is rewritten.
- Nullable P1 fields (`utilization`, `overloaded`, `density`, …) are REQUIRED
  keys that may be `null`: P1 uses `null` for missing, which is different
  from zero (engine/src/capacity.ts `utilization()` returns null for
  null/zero capacity). Keys P1 marks optional in TypeScript (and may omit)
  are optional here too.
- Timestamps inside P1 payloads stay strings: parsed for sanity, stored and
  returned verbatim so P1 formatting is never rewritten by P3.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --- Closed unions from engine/src/types.ts --------------------------------

P1DensityState = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]
P1NodeStatus = Literal["OPEN", "CLOSED"]
P1Baseline = Literal["INITIAL_GRAPH", "CURRENT_GRAPH", "CAPTURED_STATE"]
P1SimulationStatus = Literal[
    "COMPLETED",
    "TERMINATED",
    "INVALID_INPUT",
    "INVALID_SCENARIO",
    "INVALID_OVERRIDE",
    "SIMULATION_FAILURE",
    "TIMEOUT",
]
P1MetricName = Literal[
    "population",
    "occupancy",
    "flow",
    "density",
    "queue_size",
    "waiting_time",
    "travel_time",
    "arrived_population",
    "diverted_population",
    "congestion",
    "capacity_utilization",
    "throughput",
    "intervention_impact",
    "time_to_congestion",
    "peak_congestion",
    "peak_queue",
    "recovery_time",
    "duration",
]
P1TargetType = Literal["NODE", "EDGE", "GROUP", "EVENT"]
P1Aggregation = Literal["PEAK", "FINAL", "MEAN", "SUM", "FIRST", "DELTA"]
P1Unit = Literal["people", "people/minute", "metres", "metres/second", "seconds", "dimensionless"]
P1CrowdStateName = Literal["MOVING", "WAITING", "STOPPED", "ARRIVED", "DIVERTED"]
P1RouteFlexibility = Literal["NONE", "LIMITED", "FLEXIBLE"]

Number = int | float


def _iso_string(value: str) -> str:
    """Accept an ISO 8601 timestamp but return the original string unchanged."""
    datetime.fromisoformat(value)  # Python 3.11 parses trailing 'Z' too
    return value


# --- serializeMetric -------------------------------------------------------


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class P1CapacityMetric(StrictModel):
    """One node/edge capacity metric exactly as `serializeMetric` emits it."""

    id: str = Field(min_length=1, max_length=120)
    physical_capacity: int | None  # null = missing capacity, never 0
    operational_capacity: int | None
    current_occupancy: int = Field(ge=0)
    inflow: Number = Field(ge=0)
    outflow: Number = Field(ge=0)
    utilization: Number | None  # null when capacity is missing/zero
    queue_size: Number = Field(ge=0)
    overflow: Number = Field(ge=0)
    bottleneck: bool
    flow: Number
    holding_utilization: Number | None
    service_utilization: Number | None
    flow_utilization: Number | None
    overloaded: bool | None
    density: Number | None = Field(default=None, ge=0)
    density_state: P1DensityState


# --- POST /api/internal/crowd-state envelope -------------------------------


class P1CrowdStateIn(StrictModel):
    """P3-side envelope for a current crowd-state snapshot from P1.

    P1's `CapacityMetric` carries no event ID (unresolved P1 question —
    see IMPLEMENTATION_NOTES §7), so `event_id` and `timestamp` are P3-side
    envelope fields. `metrics` are P1-calculated values stored verbatim.
    """

    event_id: int
    timestamp: datetime | None = None  # when P1 measured it; defaults to server time
    metrics: list[P1CapacityMetric] = Field(min_length=1)


# --- serializeSimulationResult ---------------------------------------------


class P1SimulationMetrics(StrictModel):
    population: Number
    occupancy: Number
    flow: Number
    density: Number
    queue_size: Number
    waiting_time: Number
    travel_time: Number
    arrived_population: Number
    diverted_population: Number
    congestion: Number
    capacity_utilization: Number
    throughput: Number
    intervention_impact: Number | None
    time_to_congestion: Number | None
    peak_congestion: Number
    peak_queue: Number
    recovery_time: Number | None
    duration: Number


class P1ScopedMetric(StrictModel):
    metric: P1MetricName
    target_type: P1TargetType
    target_id: str | None
    aggregation: P1Aggregation
    value: Number | None
    unit: P1Unit


class P1FinalState(StrictModel):
    population: Number
    overloaded_nodes: list[str]
    overloaded_edges: list[str]
    active_scenario_disruptions: list[str]
    affected_entity_status: dict[str, P1NodeStatus]


class P1SimulationEvent(StrictModel):
    sim_time: str
    type: str
    target_type: P1TargetType | None
    target_id: str | None
    detail: dict


class P1SimulationWarning(StrictModel):
    code: str
    message: str


class P1CrowdLocation(StrictModel):
    kind: Literal["NODE", "EDGE"]
    id: str


class P1CrowdGroup(StrictModel):
    """`serializeCrowdGroup` — appears inside `timeline[].crowd`."""

    id: str
    source_id: str
    population: Number
    current_location: P1CrowdLocation
    destination: str
    # Optional in P1's TypeScript input type — `JSON.stringify` drops the key
    # when undefined, so these may be omitted entirely.
    average_speed: Number | None = None
    movement_rate: Number = 0
    preferred_route: list[str] = []
    assigned_route: list[str] = []
    route_flexibility: P1RouteFlexibility | None = None
    state: P1CrowdStateName
    progress: Number
    waiting_time: Number
    travel_time: Number


class P1SimulationStep(StrictModel):
    """One `timeline` entry: `SimulationStep` through the serializers."""

    time_seconds: Number
    node_metrics: list[P1CapacityMetric]
    edge_metrics: list[P1CapacityMetric]
    crowd: list[P1CrowdGroup]


class P1SimulationResult(StrictModel):
    """Full `serializeSimulationResult` payload, field for field."""

    id: str = Field(min_length=1)
    status: P1SimulationStatus
    scenario_id: str
    strategy_id: str | None
    baseline: P1Baseline
    baseline_ref: str | None
    seed: int
    simulated_start_time: str
    simulated_end_time: str
    duration: Number
    metrics: P1SimulationMetrics
    scoped_metrics: list[P1ScopedMetric]
    final_state: P1FinalState
    events: list[P1SimulationEvent]
    affected_nodes: list[str]
    affected_edges: list[str]
    affected_groups: list[str]
    bottlenecks: list[str]
    capacity_violations: list[str]
    queue_growth: dict[str, Number]
    estimated_delay_seconds: Number
    arrived_population: Number
    stranded_population: Number
    timeline: list[P1SimulationStep]
    diagnostics: list[str]
    warnings: list[P1SimulationWarning]

    @field_validator("simulated_start_time", "simulated_end_time")
    @classmethod
    def _iso(cls, value: str) -> str:
        try:
            return _iso_string(value)
        except ValueError:
            raise ValueError("must be an ISO 8601 timestamp") from None


class P1SimulationIn(StrictModel):
    """P3-side envelope for a P1 simulation result.

    P1's `scenarioId`/`strategyId` are strings with no established mapping to
    P3 integer `strategy_set_id`s (unresolved — IMPLEMENTATION_NOTES §7), so
    `strategy_set_id` is an explicit P3-side link; `result` is stored verbatim.
    """

    strategy_set_id: int
    result: P1SimulationResult
