"""P2 strategy-intelligence adapter — boundary between P3 and P2.

P2 owns strategy generation, explanations and AI decision support
(EV-003 §P2). P3 must NEVER generate strategies, invent risk values or write
AI recommendations (EV-003 §10).

Status: MOCK/STUB. Strategies reach P3 as request payloads on
POST /api/events/{id}/strategy-sets (EV-037 §9) — i.e. already produced by
P2. This adapter exists so the future P2 integration has a defined seam and
is intentionally not used to create any data today.

P4 Map/Live addition: `generate_alert_text` is the P2 boundary for
human-readable alert copy. The Groq HTTP call lives INSIDE this adapter
(P3 code never calls Groq directly); with GROQ_API_KEY unset — or on any
runtime failure — it degrades to deterministic backend copy so live-data
persistence is never blocked. The AI only verbalizes the facts P3 computed
deterministically; it never determines distances, ratios, paths or
thresholds.
"""

import logging
from dataclasses import dataclass

import httpx

from app.core.config import settings

logger = logging.getLogger("eventflow.p3")


@dataclass
class Recommendation:
    """A P2-supplied recommendation as shown on the P4 Predictions screen."""

    headline: str
    detail: str
    source: str  # "P2" or "[MOCK P2]"


@dataclass
class AlertTextFacts:
    """Deterministic facts (computed by P3 services, never by AI) to verbalize."""

    node_name: str
    state: str  # NORMAL | CROWDED | OVER_CAPACITY
    visitors_now: int
    capacity: int
    congestion_pct: float | None
    alert_threshold: int


def deterministic_alert_text(facts: AlertTextFacts) -> str:
    """Deterministic backend copy — fallback when P2/Groq is unavailable."""
    if facts.state == "OVER_CAPACITY":
        return (
            f"{facts.node_name} is over capacity "
            f"({facts.visitors_now} of {facts.capacity})."
        )
    if facts.state == "CROWDED":
        return (
            f"{facts.node_name} has crossed the {facts.alert_threshold}% crowd "
            f"threshold ({facts.congestion_pct}% of capacity)."
        )
    return f"{facts.node_name} is operating normally ({facts.congestion_pct}% of capacity)."


class P2IntelAdapter:
    """Interface for P2 strategy intelligence."""

    def explain_strategy(self, strategy_set_id: int) -> str:
        raise NotImplementedError

    def get_recommendation(self, event_id: int) -> Recommendation:
        raise NotImplementedError

    def generate_alert_text(self, facts: AlertTextFacts) -> str:
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

    def generate_alert_text(self, facts: AlertTextFacts) -> str:
        """Deterministic copy (clearly no AI in P3) until real P2 is integrated."""
        return deterministic_alert_text(facts)


class GroqP2IntelAdapter(MockP2IntelAdapter):
    """P2 alert text via Groq when GROQ_API_KEY is configured.

    Behaviour on any failure (missing key, transport error, malformed body):
    deterministic fallback copy — never an exception into the request path,
    never blocked live-data persistence, never a logged API key.
    """

    def generate_alert_text(self, facts: AlertTextFacts) -> str:
        if not settings.groq_api_key:
            return super().generate_alert_text(facts)
        prompt = (
            "Write one short operational alert sentence for event staff. "
            f"Node '{facts.node_name}' state: {facts.state}; visitors now "
            f"{facts.visitors_now} of capacity {facts.capacity} "
            f"({facts.congestion_pct}% of capacity; alert threshold "
            f"{facts.alert_threshold}%). Use only these facts."
        )
        try:
            response = httpx.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json={
                    "model": settings.groq_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 80,
                    "temperature": 0.2,
                },
                timeout=settings.groq_timeout_seconds,
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"].strip()
            if text:
                return text
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
            logger.warning("P2/Groq alert text unavailable (deterministic fallback): %s", exc)
        return deterministic_alert_text(facts)


_adapter: P2IntelAdapter = GroqP2IntelAdapter()


def get_p2_intel() -> P2IntelAdapter:
    """Return the P2 adapter (mock until the real service is integrated)."""
    return _adapter
