"""P2 strategy-intelligence adapter — boundary between P3 and P2.

P2 owns strategy generation, explanations and AI decision support
(EV-003 §P2). P3 must NEVER generate strategies, invent risk values or write
AI recommendations (EV-003 §10).

Status: MOCK/STUB. Strategies reach P3 as request payloads on
POST /api/events/{id}/strategy-sets (EV-037 §9) — i.e. already produced by
P2. This adapter exists so the future P2 integration has a defined seam and
is intentionally not used to create any data today.
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger("eventflow.p3")


@dataclass
class Recommendation:
    """A P2-supplied recommendation as shown on the P4 Predictions screen."""

    headline: str
    detail: str
    source: str  # "P2" or "[MOCK P2]"


class P2IntelAdapter:
    """Interface for P2 strategy intelligence."""

    def explain_strategy(self, strategy_set_id: int) -> str:
        raise NotImplementedError

    def get_recommendation(self, event_id: int) -> Recommendation:
        raise NotImplementedError


class MockP2IntelAdapter(P2IntelAdapter):
    """MOCK adapter — returns a clearly marked placeholder explanation.

    P3 does not invent explanations; this exists only so P4 can later render
    an explanation panel while the real P2 service is unavailable.
    """

    def explain_strategy(self, strategy_set_id: int) -> str:
        logger.info("MOCK P2 explanation requested for strategy set %s", strategy_set_id)
        return (
            f"[MOCK P2] No AI explanation is available yet for strategy set {strategy_set_id}."
        )


    def get_recommendation(self, event_id: int) -> Recommendation:
        """MOCK recommendation — placeholder only, no AI logic in P3."""
        logger.info("[MOCK P2] recommendation requested for event %s", event_id)
        return Recommendation(
            headline="[MOCK P2] No live AI recommendation available yet",
            detail=(
                "[MOCK P2] Placeholder recommendation. The real recommendation "
                "text will be supplied by the P2 service."
            ),
            source="[MOCK P2]",
        )


_adapter: P2IntelAdapter = MockP2IntelAdapter()


def get_p2_intel() -> P2IntelAdapter:
    """Return the P2 adapter (mock until the real service is integrated)."""
    return _adapter
