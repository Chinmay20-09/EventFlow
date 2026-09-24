"""P5 operational-layer adapter — boundary between P3 and execution.

After an explicit Coordinator approval, P3 triggers the operational execution
workflow (EV-022 §5). P3 never applies operational changes itself.

Status: MOCK. The real P5 layer does not exist yet, so the trigger
succeeds locally and the execution record moves to EXECUTING. The adapter
call is idempotent at the workflow layer: an already EXECUTING/COMPLETED
strategy set is never triggered twice (EV-022 §11).
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger("eventflow.p3")


@dataclass
class TriggerResult:
    success: bool
    message: str


class P5OpsAdapter:
    """Interface for the operational execution layer."""

    def trigger_execution(self, strategy_set_id: int) -> TriggerResult:
        raise NotImplementedError


class MockP5OpsAdapter(P5OpsAdapter):
    """MOCK adapter used until the real P5 operational layer exists."""

    def trigger_execution(self, strategy_set_id: int) -> TriggerResult:
        logger.info("MOCK P5 execution trigger for strategy set %s", strategy_set_id)
        return TriggerResult(
            success=True,
            message=f"[MOCK P5] Execution trigger accepted for strategy set {strategy_set_id}.",
        )


_adapter: P5OpsAdapter = MockP5OpsAdapter()


def get_p5_ops() -> P5OpsAdapter:
    """Return the P5 adapter (mock until the real operational layer is integrated)."""
    return _adapter
