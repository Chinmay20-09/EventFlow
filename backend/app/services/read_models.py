"""Read-model builders for the P4 aggregate endpoints (Phase 6/7).

Every builder only composes already-stored authoritative rows (events,
nodes, crowd_state, disruptions, predictions, simulation_results,
approvals, executions). Nothing is persisted here, no values are invented,
and no crowd/prediction/optimization intelligence is computed — only the
trivial presentation ratios documented in IMPLEMENTATION_NOTES.md §4.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.crowd import CrowdState
from app.models.disruption import Disruption
from app.models.event import Event
from app.models.graph import Node
from app.models.prediction import Prediction
from app.models.workflow import Approval, Execution, SimulationResult, StrategySet
from app.schemas.alerts import AlertOut, TimelineEntryOut
from app.schemas.dashboard import (
    DashboardOut,
    DashboardPrediction,
    DashboardStats,
    ExecutionSummary,
    ZoneOut,
)
from app.schemas.disruption import DisruptionOut
from app.schemas.event import EventOut
from app.schemas.prediction import ForecastOut, ForecastPointOut, ForecastZoneOut
from app.services.event_settings import EffectiveSettings, get_effective_settings


def _pct(value: float, capacity: int) -> float | None:
    """Trivial presentation ratio: value / capacity * 100 (null if capacity 0)."""
    if capacity <= 0:
        return None
    return round(value / capacity * 100, 1)


def _humanize(text: str) -> str:
    """\"WEATHER_EVENT\" → \"Weather event\" (presentation only)."""
    return text.replace("_", " ").capitalize()


def build_zones(db: Session, event_id: int, settings: EffectiveSettings) -> list[ZoneOut]:
    """Zones for the P4 map / Crowd Monitor / Sandbox current situation."""
    nodes = db.execute(
        select(Node).where(Node.event_id == event_id).order_by(Node.node_id)
    ).scalars().all()
    if not nodes:
        return []

    crowd_rows = db.execute(
        select(CrowdState).where(CrowdState.node_id.in_([n.node_id for n in nodes]))
    ).scalars().all()
    crowd_by_node = {row.node_id: row for row in crowd_rows}

    zones: list[ZoneOut] = []
    for node in nodes:
        crowd = crowd_by_node.get(node.node_id)
        occupancy = _pct(crowd.current_crowd, node.capacity) if crowd else None
        zones.append(
            ZoneOut(
                node_id=node.node_id,
                name=node.name,
                type=node.type,
                capacity=node.capacity,
                current_crowd=crowd.current_crowd if crowd else None,
                occupancy_pct=occupancy,
                above_threshold=occupancy is not None and occupancy >= settings.alert_threshold,
                crowd_updated_at=crowd.updated_at if crowd else None,
            )
        )
    return zones


def build_alerts(db: Session, event_id: int, settings: EffectiveSettings) -> list[AlertOut]:
    """Alerts composed from stored disruptions + threshold comparisons."""
    alerts: list[AlertOut] = []

    # 1) ACTIVE disruptions — level is the stored severity verbatim.
    disruptions = db.execute(
        select(Disruption).where(
            Disruption.event_id == event_id, Disruption.status == "ACTIVE"
        )
    ).scalars().all()
    node_ids = {nid for d in disruptions for nid in (d.affected_nodes or [])}
    node_names: dict[int, str] = {}
    if node_ids:
        for node in db.execute(select(Node).where(Node.node_id.in_(node_ids))).scalars():
            node_names[node.node_id] = node.name

    for d in disruptions:
        names = [node_names[nid] for nid in (d.affected_nodes or []) if nid in node_names]
        alerts.append(
            AlertOut(
                source="disruption",
                ref_id=d.disruption_id,
                title=f"{_humanize(d.type)} disruption",
                location=", ".join(names) if names else None,
                level=d.severity,
                created_at=d.created_at,
            )
        )

    # 2) Stored crowd at/above the organizer's stored threshold.
    for zone in build_zones(db, event_id, settings):
        if zone.above_threshold and zone.crowd_updated_at is not None:
            alerts.append(
                AlertOut(
                    source="crowd_threshold",
                    ref_id=zone.node_id,
                    title=f"Node crowd at or above {settings.alert_threshold}% threshold",
                    location=zone.name,
                    level="HIGH",
                    created_at=zone.crowd_updated_at,
                )
            )

    # 3) Stored prediction at/above threshold — only when the organizer has
    #    enabled auto AI alerts (stored setting, not an AI decision).
    if settings.auto_ai_alerts:
        for dz in _dashboard_predictions(db, event_id):
            if (
                dz.predicted_occupancy_pct is not None
                and dz.predicted_occupancy_pct >= settings.alert_threshold
            ):
                alerts.append(
                    AlertOut(
                        source="prediction_threshold",
                        ref_id=dz.prediction_id,
                        title=f"Predicted crowd at or above {settings.alert_threshold}% threshold",
                        location=dz.node_name,
                        level="HIGH",
                        created_at=dz.created_at,
                    )
                )

    alerts.sort(key=lambda a: a.created_at, reverse=True)
    return alerts


def build_timeline(db: Session, event_id: int) -> list[TimelineEntryOut]:
    """Activity timeline composed strictly from stored rows (nothing invented)."""
    entries: list[TimelineEntryOut] = []

    for d in db.execute(
        select(Disruption).where(Disruption.event_id == event_id)
    ).scalars():
        entries.append(
            TimelineEntryOut(
                source="disruption",
                ref_id=d.disruption_id,
                message=f"Disruption {d.type} recorded ({d.severity})",
                type="alert",
                created_at=d.created_at,
            )
        )

    sets = db.execute(
        select(StrategySet.strategy_set_id).where(StrategySet.event_id == event_id)
    ).scalars().all()
    set_ids = list(sets)

    if set_ids:
        for result in db.execute(
            select(SimulationResult).where(SimulationResult.strategy_set_id.in_(set_ids))
        ).scalars():
            entries.append(
                TimelineEntryOut(
                    source="simulation",
                    ref_id=result.simulation_result_id,
                    message=f"Simulation completed for strategy set #{result.strategy_set_id}",
                    type="warning",
                    created_at=result.created_at,
                )
            )

        for approval in db.execute(
            select(Approval).where(Approval.strategy_set_id.in_(set_ids))
        ).scalars():
            entries.append(
                TimelineEntryOut(
                    source="approval",
                    ref_id=approval.approval_id,
                    message=(
                        f"Strategy set #{approval.strategy_set_id} approved"
                        if approval.decision == "APPROVED"
                        else f"Strategy set #{approval.strategy_set_id} rejected"
                    ),
                    type="success" if approval.decision == "APPROVED" else "alert",
                    created_at=approval.created_at,
                )
            )

        for execution in db.execute(
            select(Execution).where(Execution.strategy_set_id.in_(set_ids))
        ).scalars():
            entries.append(
                TimelineEntryOut(
                    source="execution",
                    ref_id=execution.execution_id,
                    message=f"Execution started for strategy set #{execution.strategy_set_id}",
                    type="success",
                    created_at=execution.started_at,
                )
            )
            if execution.completed_at is not None:
                failed = execution.status == "FAILED"
                entries.append(
                    TimelineEntryOut(
                        source="execution",
                        ref_id=execution.execution_id,
                        message=(
                            f"Execution failed for strategy set #{execution.strategy_set_id}"
                            if failed
                            else f"Execution completed for strategy set #{execution.strategy_set_id}"
                        ),
                        type="alert" if failed else "success",
                        created_at=execution.completed_at,
                    )
                )

    entries.sort(key=lambda e: e.created_at, reverse=True)
    return entries


def _dashboard_predictions(db: Session, event_id: int) -> list[DashboardPrediction]:
    """Latest stored prediction per node of the event, with capacity ratios."""
    rows = db.execute(
        select(Prediction, Node)
        .join(Node, Prediction.node_id == Node.node_id)
        .where(Node.event_id == event_id)
        .order_by(Node.node_id)
    ).all()
    return [
        DashboardPrediction(
            prediction_id=prediction.prediction_id,
            node_id=node.node_id,
            node_name=node.name,
            predicted_crowd=prediction.predicted_crowd,
            predicted_occupancy_pct=_pct(prediction.predicted_crowd, node.capacity),
            prediction_horizon=prediction.prediction_horizon,
            confidence=prediction.confidence,
            created_at=prediction.created_at,
        )
        for prediction, node in rows
    ]


def build_dashboard(db: Session, event: Event) -> DashboardOut:
    """One-paint aggregate for the P4 Overview screen.

    Live-vs-simulation separation: this reads ONLY events/nodes/crowd_state/
    disruptions/predictions/executions — simulation results are never
    included (EV-016 §13).
    """
    settings = get_effective_settings(db, event)
    zones = build_zones(db, event.event_id, settings)
    alerts = build_alerts(db, event.event_id, settings)

    zones_with_data = [z for z in zones if z.current_crowd is not None]
    live_visitors = sum(z.current_crowd for z in zones_with_data)
    capacity_with_data = sum(z.capacity for z in zones_with_data)
    crowd_level_pct = _pct(live_visitors, capacity_with_data)

    # P4 equates "network capacity" with the Transit zone's occupancy.
    transit = next((z for z in zones if z.name.strip().lower() == "transit"), None)
    network_capacity_pct = transit.occupancy_pct if transit else None

    # Latest execution for this event, if any.
    execution_row = db.execute(
        select(Execution)
        .join(StrategySet, Execution.strategy_set_id == StrategySet.strategy_set_id)
        .where(StrategySet.event_id == event.event_id)
        .order_by(Execution.execution_id.desc())
        .limit(1)
    ).scalar_one_or_none()
    execution = (
        ExecutionSummary(
            strategy_set_id=execution_row.strategy_set_id,
            status=execution_row.status,
            started_at=execution_row.started_at,
            completed_at=execution_row.completed_at,
        )
        if execution_row
        else ExecutionSummary(strategy_set_id=None, status="Ready")
    )

    active_disruptions = db.execute(
        select(Disruption)
        .where(Disruption.event_id == event.event_id, Disruption.status == "ACTIVE")
        .order_by(Disruption.disruption_id)
    ).scalars().all()

    return DashboardOut(
        event=EventOut.model_validate(event),
        stats=DashboardStats(
            live_visitors=live_visitors,
            crowd_level_pct=crowd_level_pct,
            network_capacity_pct=network_capacity_pct,
            risk_level=None,  # no producer exists for current operational risk
            alert_count=len(alerts),
        ),
        zones=zones,
        execution=execution,
        active_disruptions=[DisruptionOut.model_validate(d) for d in active_disruptions],
        predictions=_dashboard_predictions(db, event.event_id),
    )


def build_forecast(db: Session, event_id: int) -> ForecastOut:
    """Forecast for the P4 Predictions screen — stored P1 data only.

    Empty `zones` when nothing has been ingested: P3 never fabricates
    forecast values or chart points.
    """
    rows = db.execute(
        select(Prediction, Node)
        .join(Node, Prediction.node_id == Node.node_id)
        .where(Node.event_id == event_id)
        .order_by(Node.node_id)
    ).all()

    zones: list[ForecastZoneOut] = []
    for prediction, node in rows:
        points = [
            ForecastPointOut(
                horizon_seconds=point.get("horizon_seconds", 0),
                predicted_value=point.get("predicted_value", 0),
                predicted_occupancy_pct=_pct(
                    point.get("predicted_value", 0), node.capacity
                ),
                confidence=point.get("confidence"),
            )
            for point in (prediction.forecast_points or [])
        ]
        zones.append(
            ForecastZoneOut(
                prediction_id=prediction.prediction_id,
                node_id=node.node_id,
                node_name=node.name,
                capacity=node.capacity,
                predicted_crowd=prediction.predicted_crowd,
                predicted_occupancy_pct=_pct(prediction.predicted_crowd, node.capacity),
                prediction_horizon=prediction.prediction_horizon,
                confidence=prediction.confidence,
                created_at=prediction.created_at,
                forecast_points=points,
            )
        )
    return ForecastOut(event_id=event_id, zones=zones)
