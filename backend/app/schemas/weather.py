"""Weather what-if scenario schemas (P4 Digital Twin §18; EV-008 weather).

P4 submits an operator-entered scenario (rainfall, duration, temperature,
wind); P3 translates it into a P1 WEATHER_EVENT disruption over the event's
stored graph and lets the REAL P1 engine run. P3 never performs any part of
the simulation itself.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import OrmModel


class WeatherScenarioCreate(BaseModel):
    """P4 what-if payload (task §18: Rainfall / Duration / Temperature / Wind)."""

    # mm/h — the single classified weather variable (0 = dry → no disruption).
    rainfall_mm: float = Field(ge=0, le=150)
    # Seconds the scenario lasts inside the P1 run.
    duration_seconds: int = Field(default=3600, ge=1, le=21600)
    # Contextual scenario entries — P1's documented disruption contract has no
    # temperature/wind field, so they are echoed for display and stored with
    # the result; they never reach P1 (nothing invented, nothing dropped).
    temperature_c: float = Field(default=26.0, ge=-40, le=60)
    wind_kmh: float = Field(default=0.0, ge=0, le=250)
    # Human label (e.g. "Heavy rain") — optional, computed from severity when
    # omitted by the P4 client.
    label: str | None = Field(default=None, max_length=80)

    model_config = ConfigDict(extra="forbid")


class WeatherScenarioOut(BaseModel, OrmModel):
    """Stored weather-scenario result: P1's own output plus the scenario echo."""

    weather_scenario_id: int
    event_id: int
    rainfall_mm: float
    duration_seconds: int
    temperature_c: float
    wind_kmh: float
    label: str | None = None
    # P1 SimulationStatus verbatim (COMPLETED / SIMULATION_FAILURE / ...).
    status: str
    # P1 result id (SIMULATION_RESULT_WEATHER_EVENT_...) when P1 completed.
    p1_result_id: str | None = None
    # Verbatim serializeSimulationResult payload — identical contract to
    # simulation_results.p1_result (never recalculated by P3).
    p1_result: dict | None = None
    # How P1 classified the weather (NORMAL/ELEVATED/HEAVY/EXTREME) when the
    # run succeeded; null on failure. Derived by P3 from the scenario input
    # only (a threshold mapping documented in P1's weather adapter contract),
    # never from any crowd value.
    severity_label: str | None = None
    created_at: datetime | None = None
