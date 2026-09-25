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
