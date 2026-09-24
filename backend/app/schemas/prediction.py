"""Prediction schemas (EV-016 §8, EV-037 §8).

The ingest schema mirrors the documented P1→P3 payload, extended with an
optional DRAFT forecast series required by the P4 60-minute chart. The
stored/response schema mirrors the EV-005 §9 minimum fields. P3 stores the
supplied values verbatim — it never computes a prediction.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import OrmModel


class ForecastPointIn(BaseModel):
    """One forecast point supplied by P1 (DRAFT — P1 confirmation required).

    `horizon_seconds` = seconds from "now" into the future; `predicted_value`
    uses the same units as the headline `predicted_value` (people).
    """

    horizon_seconds: int = Field(ge=0)
    predicted_value: float
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    model_config = ConfigDict(extra="forbid")


class PredictionIn(BaseModel):
    node_id: int
    metric: str = Field(min_length=1, max_length=40)
    predicted_value: float
    prediction_horizon: int = Field(ge=0)  # seconds
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    # Optional series for the P4 60-minute chart. Stored verbatim; omitted
    # → null (last write wins). P3 never generates points.
    forecast_points: list[ForecastPointIn] | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _crowd_metric_only(self) -> "PredictionIn":
        # EV-005/EV-037 define crowd forecasts; P3 must not interpret other metrics.
        if self.metric != "crowd":
            raise ValueError("metric must be 'crowd'")
        return self


class PredictionOut(BaseModel, OrmModel):
    prediction_id: int
    node_id: int
    predicted_crowd: float
    prediction_horizon: int
    predicted_status: str | None = None
    confidence: float | None = None
    forecast_points: list | None = None
    created_at: datetime


class ForecastPointOut(BaseModel):
    """One stored forecast point + its trivial occupancy ratio."""

    horizon_seconds: int
    predicted_value: float
    predicted_occupancy_pct: float | None  # predicted_value / capacity
    confidence: float | None = None


class ForecastZoneOut(BaseModel):
    """Per-node forecast for the P4 Predictions screen."""

    prediction_id: int
    node_id: int
    node_name: str
    capacity: int
    predicted_crowd: float
    predicted_occupancy_pct: float | None
    prediction_horizon: int
    confidence: float | None = None
    created_at: datetime
    forecast_points: list[ForecastPointOut] = []


class ForecastOut(BaseModel):
    """GET /api/events/{id}/predictions/forecast response.

    Composed from stored P1 predictions only — empty when P1 has not
    ingested data. P3 never fabricates forecast values.
    """

    event_id: int
    zones: list[ForecastZoneOut] = []
