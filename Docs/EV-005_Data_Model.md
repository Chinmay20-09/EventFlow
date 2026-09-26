    # EV-005 — Data Model

## 1. Document Purpose

This document defines what P3 stores in PostgreSQL, how the main entities relate, and which data is current state versus calculated/domain output.

The purpose is to give the P3 developer a clear database target without forcing P3 to own P1's calculations.

## 2. Storage Authority

PostgreSQL is the persistent storage layer for P3.

P3 is responsible for:

- receiving validated data;
- storing it;
- retrieving it;
- exposing it through APIs;
- maintaining workflow state.

P3 is not responsible for calculating the values it stores when those calculations belong to P1 or P2.

## 3. Current-State Principle

The MVP stores the **latest/current crowd state**.

It does not require a complete historical crowd timeline.

Example:

```text
Node 101
current_crowd = 3200
updated_at = ...
```

The purpose is to answer:

> What is the current crowd state for this node?

rather than:

> Give me the complete crowd history for the last six hours.

## 4. Event

### Purpose

Event is the main container for event-specific data.

### Minimum fields

```text
event_id
name
start_time
end_time
status
```

### Relationships

One Event can have many:

- Nodes;
- Edges/connections;
- Disruptions;
- Strategy Sets.

## 5. Node

A Node represents a location in the EventFlow graph.

### Minimum fields

```text
node_id
event_id
name
type
latitude
longitude
capacity
status
```

The node follows the node concepts defined by EV-006.

### P3 boundary

P3 stores node information required by the backend. P1 remains responsible for graph-domain behavior and calculations.

## 6. Edge / Connection

An Edge represents a movement connection.

### Minimum fields

```text
edge_id
event_id
from_node_id
to_node_id
distance
travel_time
status
```

P3 stores edge/connection information because it is required for graph relationships and travel/disruption information.

The MVP's primary monitored/reported crowd state is node-based.

P3 does not create a separate continuous edge-crowd tracking system.

## 7. Crowd State

### Minimum fields

```text
crowd_state_id
node_id
current_crowd
updated_at
```

P1 calculates/updates crowd state according to the crowd model. P3 stores the validated current state.

### Important separation

Graph configuration is not crowd state.

For example:

```text
Node capacity = graph/configuration information
Current crowd = dynamic crowd information
```

A crowd increase must not automatically change the stored graph capacity.

## 8. Disruption

### Minimum fields

```text
disruption_id
event_id
type
severity
affected_node_id / affected_edge_id
relevant impact
start_time
duration
status
```

The detailed disruption semantics follow EV-008.

A disruption describes an operational condition; it is not the same thing as the resulting crowd condition.

## 9. Prediction

### Minimum fields

```text
prediction_id
node_id
predicted_crowd
prediction_horizon
predicted_status
confidence (when supplied)
created_at
```

A prediction is a forecast.

It must not be treated as guaranteed future state.

P1 produces prediction results; P3 stores/serves them.

## 10. Strategy Set

A Strategy Set is the main decision unit.

### Minimum fields

```text
strategy_set_id
event_id
status
simulation_result_id
approval_status
created_at
```

A Strategy Set groups strategies that must be evaluated together.

## 11. Strategy

### Minimum fields

```text
strategy_id
strategy_set_id
source_node_id
destination_node_id
action
status
```

Individual strategies belong to one Strategy Set.

## 12. Why Strategies Are Grouped

Consider:

```text
Strategy A → Node C
Strategy B → Node C
```

Evaluating A and B separately may hide the fact that both increase demand at Node C.

Therefore:

```text
A + B
  ↓
Strategy Set
  ↓
One combined simulation
  ↓
One overall decision
```

P3 stores this relationship. P1 performs the actual simulation.

## 13. Simulation Result

### Minimum fields

```text
simulation_result_id
strategy_set_id
status
result_summary
conflicts / affected-node information
created_at
```

P1 produces the result.

P3 stores and serves it.

P3 does not calculate the result.

## 14. Approval

### Minimum fields

```text
approval_id
strategy_set_id
decision
approved_by
created_at
reason (optional)
```

`approved_by` refers to the authenticated Coordinator user.

Approval is associated with the whole Strategy Set.

## 15. Execution

### Minimum fields

```text
execution_id
strategy_set_id
status
started_at
completed_at
failure_reason (optional)
```

P3 tracks the execution lifecycle.

## 16. Relationships

```text
Event
 ├── Nodes
 ├── Edges
 ├── Disruptions
 └── Strategy Sets
       ├── Strategies
       ├── Simulation Result
       ├── Approval
       └── Execution

Node
 ├── Latest Crowd State
 └── Latest Prediction

Disruption
 └── Node or Edge
```

## 17. Data Ownership

| Data | Stored by P3 | Calculated/produced by |
|---|---|---|
| Event | Yes | Backend/domain input |
| Node | Yes | Graph/domain source |
| Edge | Yes | Graph/domain source |
| Current crowd | Yes | P1 |
| Disruption record | Yes | Appropriate operational/input source |
| Prediction | Yes | P1 |
| Strategy Set | Yes | P1/P2 workflow input |
| Strategy | Yes | P2/P1 strategy logic |
| Simulation Result | Yes | P1 |
| Approval | Yes | Coordinator action |
| Execution | Yes | Operational workflow |

## 18. Important Database Rule

Do not use the database to bypass the state machine.

For example, an implementation should not directly change:

```text
SIMULATED → EXECUTING
```

by manually editing a database row.

The controlled API action must enforce the transition.

## 19. Related Documents

- EV-006 — Graph Model
- EV-007 — Crowd Model
- EV-008 — Disruption Model
- EV-009 — Prediction
- EV-010 — Optimization
- EV-011 — Simulation
- EV-015 — State Machine
- EV-016 — API

---

## Addendum — Fields/Entities added for the P4 frontend contract

> Additive only. No existing entity, field or relationship above is changed.

### New entity: EventSettings

Required by the existing P4 Settings screen (event name, maximum capacity,
alert threshold, auto AI alerts):

```text
settings_id
event_id        (FK → events, unique)
max_capacity    (default 50000)
alert_threshold (default 85)
auto_ai_alerts  (default true)
updated_at
```

One row per event, created on first save. `event_name` is **not** stored
here — it remains the `Event.name` field (single source of truth).
This is event-scoped operational data, not backend configuration
(see EV-029 addendum).

### New nullable fields on existing entities

```text
StrategySet.name / description / risk_level
    Optional presentation metadata supplied by P2 and stored verbatim.
    P3 never generates strategy names, descriptions or risk levels.

StrategySet attempt tracking (already required by EV-015 §7)
    attempt_count, failure_reason — implemented as specified.

SimulationResult.predicted_metrics   (JSON, nullable)
    Structured simulation outcome supplied by P1 (DRAFT shape).
    Mock-backed while the real P1 engine is unavailable.

Prediction.forecast_points   (JSON, nullable)
    Forecast series supplied by P1 for the P4 60-minute chart (DRAFT
    contract). P3 stores points verbatim and never generates them.
```

### Explicitly still NOT stored

No `alerts` table, no `activity_log` table, no edge-flow/crowd-flow table,
no historical crowd tables — alerts and the activity timeline are composed
at read time from the entities above, and edge flow is `P1 INPUT REQUIRED`
(pending P1 confirmation — not implemented).

    
