"""Congestion service — deterministic threshold detection for the P4 live map.

Congestion = visitors_now / capacity (P4 Map §3). This module computes the
ratio and detects threshold crossings against the event's STORED
`event_settings.alert_threshold` (organizer-owned, default 85). It performs
no simulation and no propagation — P1 owns those; when the real P1 engine
exposes its congestion detection through the adapter boundary, this module
is the seam that must be replaced. Capacity zero is handled safely (ratio
is None, never a division error; the state is reported instead).
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.crowd import CrowdState
from app.models.graph import Node
from app.services.event_settings import EffectiveSettings, get_effective_settings

STATE_NORMAL = "NORMAL"
STATE_CROWDED = "CROWDED"
STATE_OVER_CAPACITY = "OVER_CAPACITY"


@dataclass
class CongestionResult:
    node_id: int
    capacity: int
    visitors_now: int
    visitors_expected: int | None
    congestion_ratio: float | None  # visitors_now / capacity (None if capacity <= 0)
    congestion_pct: float | None  # ratio * 100, rounded to 0.1
    alert_threshold: int
    crossed_threshold: bool
    state: str  # NORMAL | CROWDED | OVER_CAPACITY


def compute_congestion(
    node: Node, visitors_now: int, settings: EffectiveSettings
) -> CongestionResult:
    """Pure deterministic computation for one node (no AI, no simulation)."""
    ratio: float | None = None
    pct: float | None = None
    if node.capacity > 0:
        ratio = visitors_now / node.capacity
        pct = round(ratio * 100, 1)

    # Capacity 0 is handled safely: the ratio stays None (no division), and
    # people present with zero capacity is over capacity by definition.
    if visitors_now > node.capacity:
        state = STATE_OVER_CAPACITY
        crossed = True
    elif pct is not None and pct >= settings.alert_threshold:
        state = STATE_CROWDED
        crossed = True
    else:
        state = STATE_NORMAL
        crossed = False

    return CongestionResult(
        node_id=node.node_id,
        capacity=node.capacity,
        visitors_now=visitors_now,
        visitors_expected=node.visitors_expected,
        congestion_ratio=round(ratio, 4) if ratio is not None else None,
        congestion_pct=pct,
        alert_threshold=settings.alert_threshold,
        crossed_threshold=crossed,
        state=state,
    )


def congestion_for_node(db: Session, event, node: Node) -> CongestionResult:
    """Congestion from the stored live count (crowd_state.current_crowd)."""
    settings = get_effective_settings(db, event)
    row = db.execute(
        select(CrowdState).where(CrowdState.node_id == node.node_id)
    ).scalar_one_or_none()
    return compute_congestion(node, row.current_crowd if row else 0, settings)
