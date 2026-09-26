"""Alert and timeline read-model schemas (Phase 6/7).

Both are read-time compositions of existing stored rows — no `alerts` or
`activity_log` table exists, and no entry is ever invented.
"""

from datetime import datetime

from pydantic import BaseModel


class AlertOut(BaseModel):
    """One alert for the P4 Predictive Alerts panel + notification badge.

    `source` documents which stored data produced the alert:
    - `disruption`          → an ACTIVE disruption row (level = stored severity)
    - `crowd_threshold`     → stored crowd >= stored alert threshold
    - `prediction_threshold`→ stored prediction >= threshold (only when
                              auto_ai_alerts is enabled)

    P3 generates no prediction and no AI alert — it only compares stored
    P1/P2 values against the organizer's stored threshold at read time.
    """

    source: str
    ref_id: int  # id of the underlying stored row/node/prediction
    title: str  # factual re-formulation of the stored row
    location: str | None  # affected node name(s), if any
    level: str  # HIGH / MEDIUM / LOW (stored severity for disruptions)
    created_at: datetime


class TimelineEntryOut(BaseModel):
    """One factual activity entry composed from a stored row.

    `type` is one of the three keys the P4 timeline already renders:
    `alert` (red), `warning` (yellow), `success` (green).
    """

    source: str  # disruption | simulation | approval | execution
    ref_id: int  # id of the underlying stored row
    message: str
    type: str  # alert | warning | success
    created_at: datetime
