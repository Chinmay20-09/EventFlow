# EV-037 — API Examples

## 1. Document Purpose

EV-037 provides concrete examples of how the APIs defined by EV-016 are used.

It is a developer reference, not a second API specification.

If this document conflicts with EV-016, EV-016 is the authoritative API definition.

## 2. Example Structure

Each important example contains:

* method;
* endpoint;
* purpose;
* JSON request where required;
* successful JSON response;
* important error response where useful.

No curl examples are included.

## 3. Create Event

### Endpoint

```text
POST /api/events
```

### Purpose

Create an Event.

### Request

```json
{
  "name": "Mumbai Mega Event",
  "start_time": "2026-10-10T10:00:00Z",
  "end_time": "2026-10-10T22:00:00Z"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "event_id": 1,
    "name": "Mumbai Mega Event",
    "status": "ACTIVE"
  }
}
```

## 4. Get Event

```text
GET /api/events/1
```

Example response:

```json
{
  "success": true,
  "data": {
    "event_id": 1,
    "name": "Mumbai Mega Event",
    "start_time": "2026-10-10T10:00:00Z",
    "end_time": "2026-10-10T22:00:00Z",
    "status": "ACTIVE"
  }
}
```

## 5. Create Node

```text
POST /api/events/1/nodes
```

Request:

```json
{
  "name": "Main Gate",
  "type": "GATE",
  "latitude": 19.0760,
  "longitude": 72.8777,
  "capacity": 5000,
  "status": "OPEN"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "node_id": 101,
    "event_id": 1,
    "name": "Main Gate"
  }
}
```

## 6. Get Current Crowd

```text
GET /api/nodes/101/crowd
```

Response:

```json
{
  "success": true,
  "data": {
    "node_id": 101,
    "current_crowd": 3200,
    "updated_at": "2026-10-10T12:00:00Z"
  }
}
```

This is the latest/current crowd state, not a historical timeline.

## 7. Create Disruption

```text
POST /api/events/1/disruptions
```

Example request:

```json
{
  "type": "WEATHER_EVENT",
  "severity": "HIGH",
  "affected_nodes": [120],
  "affected_edges": [],
  "start_time": "2026-10-10T12:10:00Z",
  "expected_duration": 1800,
  "source": "external"
}
```

The exact disruption fields must remain consistent with EV-008.

## 8. Submit Prediction

```text
POST /api/internal/predictions
```

Example:

```json
{
  "node_id": 120,
  "metric": "crowd",
  "predicted_value": 8200,
  "prediction_horizon": 600,
  "confidence": 0.91
}
```

P3 validates and stores the result produced by the appropriate P1 component.

## 9. Create Strategy Set

```text
POST /api/events/1/strategy-sets
```

Example:

```json
{
  "strategies": [
    {
      "source_node_id": 101,
      "destination_node_id": 120,
      "action": "REDIRECT_FLOW"
    },
    {
      "source_node_id": 103,
      "destination_node_id": 121,
      "action": "REDIRECT_FLOW"
    }
  ]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "strategy_set_id": 801,
    "status": "PROPOSED"
  }
}
```

## 10. Simulate Strategy Set

```text
POST /api/strategy-sets/801/simulate
```

The endpoint starts the simulation workflow.

Example response:

```json
{
  "success": true,
  "data": {
    "strategy_set_id": 801,
    "simulation_result_id": 901,
    "status": "SIMULATED"
  }
}
```

The actual simulation calculation remains a P1 responsibility.

## 11. Approve Strategy Set

```text
POST /api/strategy-sets/801/approve
```

The authenticated Coordinator identity is used as `approved_by`.

The client does not prove identity by sending an arbitrary name.

After successful approval, the system automatically triggers the P5/operational execution workflow.

Response:

```json
{
  "success": true,
  "data": {
    "strategy_set_id": 801,
    "status": "APPROVED",
    "execution_triggered": true
  }
}
```

## 12. Reject Strategy Set

```text
POST /api/strategy-sets/801/reject
```

Response:

```json
{
  "success": true,
  "data": {
    "strategy_set_id": 801,
    "status": "REJECTED"
  }
}
```

Rejected/failed Strategy Sets do not require permanent historical storage for the MVP.

## 13. Get Execution Status

```text
GET /api/strategy-sets/801/execution
```

Response:

```json
{
  "success": true,
  "data": {
    "execution_id": 1001,
    "strategy_set_id": 801,
    "status": "EXECUTING",
    "started_at": "2026-10-10T12:30:00Z",
    "completed_at": null
  }
}
```

## 14. No Separate Execute Request

The MVP does **not** use:

```text
POST /api/strategy-sets/801/execute
```

The workflow is:

```text
SIMULATED
    ↓
Coordinator approves
    ↓
APPROVED
    ↓
Automatic execution trigger
    ↓
EXECUTING
    ↓
COMPLETED
```

## 15. Invalid State Example

Trying to approve a Strategy Set that is not `SIMULATED`:

```text
POST /api/strategy-sets/801/approve
```

Example:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Only a simulated strategy set can be approved"
  }
}
```

## 16. Forbidden Role Example

If a Visitor tries:

```text
POST /api/strategy-sets/801/approve
```

the request must be rejected because approval requires Coordinator authorization.

## 17. Not Found Example

```text
GET /api/strategy-sets/999999
```

Example:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Strategy set not found"
  }
}
```

## 18. Consistency Rules

All examples follow EV-016:

* `/api` base path;
* JSON;
* synchronous requests;
* standard response format;
* no pagination;
* controlled workflow actions;
* no generic workflow PATCH;
* no hard-delete workflow endpoints;
* no separate manual execution request after approval.

## 19. Related Documents

* EV-016 — API
* EV-015 — State Machine
* EV-022 — Execution Model
* EV-023 — Security
* EV-024 — Error Handling

---

## Addendum — P4 Aggregate Endpoint Examples (added for the P4 frontend contract)

> Examples for the endpoints introduced by the EV-016 addendum. EV-016
> remains authoritative. No curl examples (per §2).

### Dashboard

```text
GET /api/events/1/dashboard
```

```json
{
  "success": true,
  "data": {
    "event": { "event_id": 1, "name": "Mumbai Music Festival", "status": "ACTIVE", "start_time": "2026-10-10T10:00:00", "end_time": "2026-10-10T22:00:00" },
    "stats": { "live_visitors": 4200, "crowd_level_pct": 70.0, "network_capacity_pct": 50.0, "risk_level": null, "alert_count": 2 },
    "zones": [
      { "node_id": 101, "name": "North Gate", "type": "GATE", "capacity": 5000, "current_crowd": 4600, "occupancy_pct": 92.0, "above_threshold": true, "crowd_updated_at": "2026-10-10T12:00:00" }
    ],
    "execution": { "strategy_set_id": null, "status": "Ready", "started_at": null, "completed_at": null },
    "active_disruptions": [],
    "predictions": [
      { "prediction_id": 1, "node_id": 101, "node_name": "North Gate", "predicted_crowd": 4450.0, "predicted_occupancy_pct": 89.0, "prediction_horizon": 3600, "confidence": 0.9, "created_at": "2026-10-10T11:55:00" }
    ]
  }
}
```

`risk_level` is `null` because no producer exists yet — P3 does not invent
risk. `execution.status` is `"Ready"` when no execution record exists.

### Zones

```text
GET /api/events/1/zones
```

```json
{
  "success": true,
  "data": [
    { "node_id": 101, "name": "North Gate", "type": "GATE", "capacity": 5000, "current_crowd": 4600, "occupancy_pct": 92.0, "above_threshold": true, "crowd_updated_at": "2026-10-10T12:00:00" },
    { "node_id": 103, "name": "East Zone", "type": "ZONE", "capacity": 3000, "current_crowd": null, "occupancy_pct": null, "above_threshold": false, "crowd_updated_at": null }
  ]
}
```

`occupancy_pct` is `null` when no crowd is stored or `capacity` is 0.
Edge movement/flow is intentionally absent until P1 provides it.

### Alerts

```text
GET /api/events/1/alerts
```

```json
{
  "success": true,
  "data": [
    { "source": "disruption", "ref_id": 10, "title": "Weather event disruption", "location": "East Zone", "level": "MEDIUM", "created_at": "2026-10-10T11:52:00" },
    { "source": "crowd_threshold", "ref_id": 101, "title": "Node crowd at or above 85% threshold", "location": "North Gate", "level": "HIGH", "created_at": "2026-10-10T12:00:00" }
  ]
}
```

### Timeline

```text
GET /api/events/1/timeline
```

```json
{
  "success": true,
  "data": [
    { "source": "execution", "ref_id": 1, "message": "Execution completed for strategy set #1", "type": "success", "created_at": "2026-10-10T12:35:00" },
    { "source": "approval", "ref_id": 1, "message": "Strategy set #1 approved", "type": "success", "created_at": "2026-10-10T12:30:00" },
    { "source": "simulation", "ref_id": 1, "message": "Simulation completed for strategy set #1", "type": "warning", "created_at": "2026-10-10T12:29:00" }
  ]
}
```

Empty data arrays are returned when nothing is stored — entries are never
invented.

### Prediction forecast

```text
GET /api/events/1/predictions/forecast
```

```json
{
  "success": true,
  "data": {
    "event_id": 1,
    "zones": [
      {
        "prediction_id": 1,
        "node_id": 101,
        "node_name": "North Gate",
        "capacity": 5000,
        "predicted_crowd": 4450.0,
        "predicted_occupancy_pct": 89.0,
        "prediction_horizon": 3600,
        "confidence": 0.9,
        "created_at": "2026-10-10T11:55:00",
        "forecast_points": [
          { "horizon_seconds": 600, "predicted_value": 4100.0, "predicted_occupancy_pct": 82.0, "confidence": 0.93 }
        ]
      }
    ]
  }
}
```

When P1 has not ingested predictions, `zones` is `[]`.

### Current crowd ingestion (P1 → P3)

```text
POST /api/internal/crowd
```

```json
{
  "event_id": 1,
  "node_id": 101,
  "current_crowd": 3200,
  "timestamp": "2026-10-10T12:00:00Z",
  "source": "p1-crowd-engine",
  "quality": 0.95
}
```

```json
{
  "success": true,
  "data": { "node_id": 101, "current_crowd": 3200, "updated_at": "2026-10-10T12:00:00" }
}
```

### Settings

```text
GET /api/events/1/settings
```

```json
{
  "success": true,
  "data": { "event_id": 1, "event_name": "Mumbai Music Festival", "max_capacity": 50000, "alert_threshold": 85, "auto_ai_alerts": true, "updated_at": null }
}
```

`updated_at: null` means no settings row exists yet — defaults are
returned and nothing is written by the GET.

```text
PUT /api/events/1/settings
```

```json
{ "alert_threshold": 90 }
```

```json
{
  "success": true,
  "data": { "event_id": 1, "event_name": "Mumbai Music Festival", "max_capacity": 50000, "alert_threshold": 90, "auto_ai_alerts": true, "updated_at": "2026-10-10T12:40:00" }
}
```

Partial updates only change supplied fields. Requires an authenticated
Organizer or Coordinator; a Visitor receives `FORBIDDEN`.
