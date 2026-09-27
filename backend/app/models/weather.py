"""Weather what-if scenario results (P4 Digital Twin; task §17–§18).

Each row stores the operator-entered scenario verbatim together with P1's
verbatim simulation output. The live event state is never modified by a
weather scenario — these are simulation-only rows (EV-016 §13).
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.utils import utcnow
from app.db.base import Base


class WeatherScenario(Base):
    """One what-if weather simulation through the real P1 engine."""

    __tablename__ = "weather_scenarios"

    weather_scenario_id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Scenario inputs as submitted by P4 (echoed for display; nothing derived).
    rainfall_mm: Mapped[float] = mapped_column(Float, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=3600)
    temperature_c: Mapped[float] = mapped_column(Float, nullable=False, default=26.0)
    wind_kmh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # P1 SimulationStatus verbatim (COMPLETED / SIMULATION_FAILURE / ...).
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # The engine's own result id (SIMULATION_RESULT_WEATHER_EVENT_...) —
    # null when the run failed before producing a result.
    p1_result_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Verbatim serializeSimulationResult payload (same contract as
    # simulation_results.p1_result) — stored as-is, exposed as-is.
    p1_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Threshold mapping of the scenario input (P3 presentation metadata;
    # never derived from crowd values).
    severity_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
