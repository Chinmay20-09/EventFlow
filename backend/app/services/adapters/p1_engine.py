"""P1 engine adapter — boundary between P3 and P1's calculation engine.

P3 must NEVER calculate crowd propagation, prediction, optimization or
simulation results (EV-003 §10, EV-016 §20). This adapter is the single
seam where a P1-produced result enters the backend.

Status: MOCK. The real P1 engine is not available yet, so a clearly marked
placeholder result is returned. Replace `MockP1EngineAdapter` with a real
client (or wire results arriving through POST /api/internal/simulations)
without touching the workflow service.
"""

import logging
from dataclasses import dataclass, field

logger = logging.getLogger("eventflow.p3")


@dataclass
class SimulationOutcome:
    """Structurally-valid simulation output as stored per EV-005 §13.

    `predicted_metrics` is an optional structured outcome (predicted crowd
    level, network capacity, risk) as supplied by P1. P3 stores it verbatim
    — it never computes these values.
    """

    status: str
    result_summary: str
    conflicts: list = field(default_factory=list)
    predicted_metrics: dict | None = None


class P1EngineAdapter:
    """Interface for the P1 simulation engine."""

    def run_simulation(self, strategy_set_id: int, strategies: list[dict]) -> SimulationOutcome:
        raise NotImplementedError


class MockP1EngineAdapter(P1EngineAdapter):
    """MOCK adapter used until the real P1 engine exists.

    It performs no calculation of its own — it only produces a clearly marked
    placeholder outcome so P4 can be exercised end-to-end.
    """

    def run_simulation(self, strategy_set_id: int, strategies: list[dict]) -> SimulationOutcome:
        logger.info("MOCK P1 simulation requested for strategy set %s", strategy_set_id)
        return SimulationOutcome(
            status="SUCCESS",
            result_summary=(
                "[MOCK P1] Placeholder simulation result. "
                "No real simulation was calculated — P3 does not simulate. "
                f"Strategy set {strategy_set_id} contains {len(strategies)} strategy/strategies."
            ),
            conflicts=[],
            # Clearly marked mock metrics so P4 can be exercised end-to-end.
            # Shape is DRAFT until confirmed by P1.
            predicted_metrics={
                "source": "[MOCK P1]",
                "crowd_level_pct": 68.0,
                "network_capacity_pct": 72.0,
                "risk_level": "Low",
            },
        )


_adapter: P1EngineAdapter = MockP1EngineAdapter()


def get_p1_engine() -> P1EngineAdapter:
    """Return the P1 adapter (mock until the real engine is integrated)."""
    return _adapter
