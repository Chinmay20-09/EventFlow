# EV-016 — API

## 1. Document Purpose

This document defines the FastAPI contract used by the MVP.

It is the primary reference for endpoint names, request style, response format, and workflow actions.

EV-037 provides concrete examples.

## 2. API Principles

The MVP API uses:

* FastAPI;
* HTTP/REST;
* JSON;
* `/api` base path;
* integer IDs;
* synchronous request/response;
* no `/v1` prefix;
* no pagination;
* simple useful filters where needed;
* controlled workflow actions.

## 3. Standard Response Format

### Success

```json
{
  "success": true,
  "data": {}
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Clients should use the `success` field and error code rather than parsing arbitrary message text.

## 4. Event Endpoints

### Create Event

```text
POST /api/events
```

Creates an Event.

### List Events

```text
GET /api/events
```

Returns relevant Events.

### Get Event

```text
GET /api/events/{event_id}
```

Returns one Event.

## 5. Node Endpoints

```text
POST /api/events/{event_id}/nodes
GET  /api/events/{event_id}/nodes
GET  /api/nodes/{node_id}
```

P3 stores and serves graph-related node data required by the backend.

## 6. Crowd Endpoint

```text
GET /api/nodes/{node_id}/crowd
```

Returns the current stored crowd state for the node.

P3 does not calculate the crowd state.

## 7. Disruption Endpoints

```text
POST /api/events/{event_id}/disruptions
GET  /api/events/{event_id}/disruptions
GET  /api/disruptions/{disruption_id}
```

Disruption input must follow the EventFlow disruption model.

Useful filtering may include:

```text
?status=ACTIVE
?type=WEATHER_EVENT
```

## 8. Internal Prediction Endpoints

```text
POST /api/internal/predictions
GET  /api/nodes/{node_id}/prediction
```

P1 sends validated prediction results to P3.

P3 stores and exposes them.

## 9. Strategy Set Endpoints

```text
POST /api/events/{event_id}/strategy-sets
GET  /api/events/{event_id}/strategy-sets
GET  /api/strategy-sets/{strategy_set_id}
```

A Strategy Set is the main unit for simulation, approval, and execution.

## 10. Simulation Endpoints

```text
POST /api/strategy-sets/{strategy_set_id}/simulate
GET  /api/strategy-sets/{strategy_set_id}/simulation
```

P3 controls the workflow and stores/serves the simulation result.

P1 owns simulation calculations.

## 11. Approval Endpoints

```text
POST /api/strategy-sets/{strategy_set_id}/approve
POST /api/strategy-sets/{strategy_set_id}/reject
```

Only an authenticated Coordinator can perform these actions.

Approval is allowed only from `SIMULATED`.

After successful approval, the backend automatically triggers the P5/operational execution workflow.

## 12. Execution Workflow

There is **no separate manual `/execute` endpoint** in the locked MVP workflow.

The execution flow is:

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

P3 triggers the operational execution workflow after explicit Coordinator approval.

P3 must not trigger execution before approval.

## 13. Current Event State

```text
GET /api/events/{event_id}/state
```

This endpoint refers to the **current/live operational state**.

It must not return a simulation state as though it were live state.

P3 assembles the current stored backend state needed by the consumer.

P3 does not recalculate P1 results simply because this endpoint was requested.

## 14. Internal Domain API Groups

P1/P2-to-P3 communication is organized by domain:

```text
/api/internal/predictions
/api/internal/strategies
/api/internal/simulations
/api/internal/disruptions
/api/internal/crowd
```

## 15. Producer-to-P3 Pattern

The producer sends a result to P3.

Example:

```text
P1/P2
 ↓
P3 internal API
 ↓
P3 validates
 ↓
P3 stores
 ↓
P4 consumes through P3 API
```

This keeps the database behind P3 rather than allowing other components to write directly to PostgreSQL.

## 16. No Generic Workflow PATCH

Important state changes are not performed with unrestricted:

```text
PATCH /api/strategy-sets/{id}
```

Instead, explicit actions are used.

This makes authorization and state validation easier to enforce.

## 17. No Hard Delete for Operational Records

Important operational records such as:

* disruptions;
* Strategy Sets;
* simulation results;
* approvals;
* executions

do not receive generic hard-delete endpoints in the MVP.

Rejected/failed Strategy Sets do not require a separate permanent history in the MVP.

## 18. Pagination

Pagination is not required for the MVP.

List endpoints return the relevant records.

This can be revisited later if dataset size requires it.

## 19. Authentication

The MVP has three user types:

* Organizer;
* Coordinator;
* Visitor.

Organizer and Coordinator are authenticated.

Visitor has read-only/public access according to the agreed frontend behavior.

Protected Coordinator actions require an authenticated Coordinator.

The separate internal P1/P2 API authentication mechanism is not required for the MVP.

## 20. P3 Does Not Calculate

The API layer must not become a second calculation engine.

P3 validates, stores, retrieves, and coordinates workflow.

## 21. Related Documents

* EV-003 — Architecture
* EV-005 — Data Model
* EV-015 — State Machine
* EV-020 — External Data
* EV-022 — Execution Model
* EV-023 — Security
* EV-024 — Error Handling
* EV-037 — API Examples
