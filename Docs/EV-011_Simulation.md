# EV-011 — Simulation Model

**Document ID:** EV-011
**Domain:** Simulation
**Status:** MVP Specification
**Depends On:** EV-006 Graph Model, EV-007 Crowd Model, EV-008 Disruption Model, EV-009 Prediction, EV-010 Optimization
**Consumed By:** EV-010 Optimization, Operator UI

**Purpose:** Define sandbox / digital-twin simulation, scenario execution and strategy comparison for EventFlow.

---

## 1. Purpose

The Simulation Model provides EventFlow with a controlled **sandbox / digital-twin environment** for testing event conditions and intervention strategies without changing the live operational state.

Simulation answers exactly one question: **"What happens if we execute this scenario?"**

It allows EventFlow to:

* reproduce a configured event state
* apply hypothetical changes
* progress the event through time
* propagate crowd movement
* apply disruptions
* invoke Prediction where configured
* evaluate intervention strategies
* compare different scenarios
* return measurable outcomes to Optimization

Simulation is the controlled execution environment for the EventFlow decision loop.

---

## 2. Scope

### 2.1 In Scope

* scenario definition and validation
* baseline selection and state isolation
* scenario overrides
* controlled simulation time
* crowd propagation by executing EV-007
* disruption scheduling and application inside the sandbox
* intervention execution inside the sandbox
* optional prediction invocation
* metric collection
* timeline capture
* deterministic execution
* strategy comparison
* result handoff to Optimization

### 2.2 Out of Scope

| Concern | Owner |
| --- | --- |
| Graph topology, configuration, authoritative status | EV-006 |
| Crowd rules, metrics and movement behaviour | EV-007 |
| Disruption schema, severity, lifecycle | EV-008 |
| Forecasting | EV-009 |
| Strategy generation, feasibility, objectives, ranking | EV-010 |
| Applying a simulated or approved change to live state | Operational layer |

**Simulation never mutates live state.** It executes a copy and discards it.

---

## 3. Architecture and Isolation

### 3.1 Core Architecture

```text
Initial / Current Event State
            │
            ▼
     Scenario Creation
            │
            ▼
      Sandbox State
            │
      ┌─────┴─────┐
      │           │
  Conditions   Interventions
      │           │
      └─────┬─────┘
            ▼
       Simulation
            │
            ▼
      State Evolution
            │
            ▼
       Measurements
            │
            ▼
      SimulationResult
```

### 3.2 Isolation Rule

**Every simulation runs against an isolated scenario copy.** Changes made during a simulation:

* do not modify the Initial Graph
* do not modify the Current Graph
* do not modify live crowd state
* do not modify the live disruption registry
* do not modify live operational parameters
* do not modify live prediction history

```text
Live State
    │
    ├── Scenario A → Sandbox A
    ├── Scenario B → Sandbox B
    └── Scenario C → Sandbox C
```

Each scenario begins from the same selected baseline unless the comparison explicitly configures otherwise (§18).

### 3.3 Isolation Enforcement

| Live object | Scenario interaction | Enforcement |
| --- | --- | --- |
| Initial Graph | read-only reference for baseline selection | never written |
| Current Graph | **copied** into the scenario at creation | copy-on-create, never written |
| Crowd state | **copied** into the scenario at creation | copy-on-create, never written |
| Disruption registry | live entries **copied** as context; scenario disruptions are added to the scenario registry only | scenario registry is separate |
| Operational parameters | copied, then scenario overrides applied to the copy | copy-on-create |
| Prediction history | read-only; scenario predictions are scenario-scoped | never written |

A simulation result is **never** promoted to live state automatically. Promotion is an explicit authorized application by the operational layer (EV-010 §13).

---

## 4. Digital Twin State

The digital twin consists of five components. Each exists as a **base/live object** and, inside a run, as a **scenario copy**.

| Component | Base / live object | Scenario copy |
| --- | --- | --- |
| **Graph State** | Initial Graph, Current Graph (EV-006) | the copied graph with graph overrides and interventions applied |
| **Crowd State** | live EV-007 crowd groups, occupancies, queues, metrics | the copied crowd state with crowd overrides applied and propagation executed |
| **Disruption State** | live EV-008 registry | copied live disruptions plus scenario disruptions (`source = SIMULATION`) |
| **Operational Parameters** | live EV-006 operational parameters | the copied parameter set with scenario overrides applied |
| **Simulation Time** | real wall-clock time | scenario-owned simulated clock (§8) |

The Graph provides the environment. The Crowd provides movement and population state. Disruptions provide changed conditions. Operational parameters provide configured limits. Simulation provides controlled time and state evolution.

**Simulation Time has no live counterpart.** It exists only inside a run.

---

## 5. Baseline

A scenario must specify its starting state.

| `baseline` | Meaning |
| --- | --- |
| `INITIAL_GRAPH` | Start from the locked pre-event baseline (EV-006 §11.1) |
| `CURRENT_GRAPH` | Start from the latest authorized operational configuration (EV-006 §11.2). This is the default for live decision support. |
| `CAPTURED_STATE` | Start from a previously captured event state. Requires `baseline_ref`. |

Rules:

* `CURRENT_GRAPH` is the default, and is what EV-010 uses for strategy evaluation.
* `INITIAL_GRAPH` is used for planning and for post-event comparison against the configured plan.
* `CAPTURED_STATE` requires a `baseline_ref` identifying the captured state; a missing or unknown reference produces `INVALID_SCENARIO`.
* The selected baseline is **copied** into scenario state at creation. The baseline itself is never modified.
* Every `SimulationResult` records the `baseline` and `baseline_ref` used, so a result can always be traced to its starting state.

---

## 6. Scenario Schema

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | Required | `SCENARIO_<NUMBER>` |
| `name` | string | Required | Human-facing scenario name |
| `baseline` | enum | Required | `INITIAL_GRAPH`, `CURRENT_GRAPH`, `CAPTURED_STATE` |
| `baseline_ref` | string \| null | Required | Required when `baseline = CAPTURED_STATE`; otherwise `null` |
| `graph_overrides` | object[] | Optional | Graph configuration changes applied to the scenario copy (§7.1) |
| `crowd_overrides` | object[] | Optional | Crowd state changes applied to the scenario copy (§7.2) |
| `disruption_overrides` | object[] | Optional | Hypothetical disruptions, using the EV-008 schema (§7.3) |
| `operational_parameters` | object[] | Optional | EV-006 operational parameter values applied to the scenario copy (§7.4) |
| `interventions` | object[] | Optional | EV-010 `parameter_changes` to execute inside the scenario (§12) |
| `start_time` | timestamp | Required | Simulated start time, ISO-8601 UTC |
| `duration` | integer | Required | Simulated duration in **seconds** |

Not every field is required for every simulation. `graph_overrides`, `crowd_overrides`, `disruption_overrides`, `operational_parameters` and `interventions` may each be empty.

The `Scenario` type is owned by EV-011. EV-010 constructs scenario instances but does not own the schema.

### 6.1 Scenario Example

```json
{
  "id": "SCENARIO_03",
  "name": "Open east exit and rebalance demand",
  "baseline": "CURRENT_GRAPH",
  "baseline_ref": null,
  "graph_overrides": [],
  "crowd_overrides": [],
  "disruption_overrides": [],
  "operational_parameters": [],
  "interventions": [
    { "parameter": "status", "target_type": "NODE", "target_id": "EXIT_01",
      "previous_value": "CLOSED", "proposed_value": "OPEN" }
  ],
  "start_time": "2026-09-19T19:01:00Z",
  "duration": 600
}
```

---

## 7. Scenario Overrides

Overrides are applied to the **scenario copy only**, and they use the same field names, units and validation rules as the owning document.

### 7.1 Graph Overrides

Graph overrides use the EV-006 operational parameter keys.

| `key` | Valid `scope` | Unit | Allowed values |
| --- | --- | --- | --- |
| `status` | `NODE`, `EDGE` | — | `OPEN`, `CLOSED` |
| `capacity` | `NODE` | **people** | integer ≥ 0 |
| `capacity` | `EDGE` | **people/minute** | number ≥ 0 |
| `throughput_capacity` | `NODE` | **people/minute** | number ≥ 0 |
| `restriction` | `NODE`, `EDGE`, `EVENT` | — | restriction label |

**`restriction` overrides are gated.** A scenario may carry `restriction` overrides only when `allow_restriction_overrides = true` is configured for the run; otherwise a `restriction` override yields `INVALID_OVERRIDE`. This keeps scenario restrictions an explicit, opt-in capability rather than something a scenario acquires by accident.

The three restriction roles are distinct:

| Role | Where it lives |
| --- | --- |
| **Declared** by a disruption | EV-008 `operational_effects` with `parameter = restriction` |
| **Applied** to operational or scenario state | Live: EV-006 Current Graph, applied by the operational layer. Scenario: the scenario graph copy, applied by the scenario's operational layer (§11) |
| **Consumed** as a constraint | EV-010 reads active restrictions as fixed constraints (EV-010 §5.2, C7) |

Scenario restrictions apply to the scenario graph copy only. They are never written to the live Current Graph, the live restriction set, or live effect provenance.

### 7.2 Crowd Overrides

Crowd overrides adjust scenario crowd state at scenario creation.

| Field | Unit | Meaning |
| --- | --- | --- |
| `group_id` | — | Target EV-007 group id; may create a new group when absent |
| `population` | **people** | Replacement population |
| `current_location` | — | `{ kind: NODE \| EDGE, id }` |
| `destination` | — | EV-006 node id |
| `assigned_route` | — | Ordered EV-006 edge id list |
| `route_flexibility` | — | `NONE`, `LIMITED`, `FLEXIBLE` |
| `average_speed` | **metres/second** | Replacement walking speed |

Only these fields may be overridden. Crowd **metrics** (occupancy, flow, queue, density, utilization) are never overridden directly — they are recomputed from state by EV-007, because they are derived values, not inputs.

### 7.3 Disruption Overrides

Scenario disruptions are complete EV-008 objects with `source = SIMULATION`.

```json
{
  "id": "SIM_DISRUPTION_001",
  "type": "ROAD_CLOSURE",
  "affected_nodes": ["ROAD_01"],
  "affected_edges": [],
  "severity": "MEDIUM",
  "start_time": "2026-09-19T19:05:00Z",
  "expected_duration": 600,
  "status": "DETECTED",
  "source": "SIMULATION",
  "operational_effects": []
}
```

Same schema, same validation, same units, same lifecycle rules as EV-008. There is no simulation-only disruption format. Scenario disruptions are added to the **scenario registry only** and never to the live registry.

### 7.4 Operational Parameter Overrides

Operational parameter overrides use the EV-006 operational parameter object (`key`, `scope`, `target_id`, `value`, `unit`) and are applied to the scenario copy.

### 7.5 Override Validation

All overrides are validated **before** execution begins.

| Failure | Result |
| --- | --- |
| An override references an unknown node or edge | `INVALID_OVERRIDE` |
| An override uses an invalid key, scope or unit for its target | `INVALID_OVERRIDE` |
| A crowd override uses a field that is derived rather than direct | `INVALID_OVERRIDE` |
| A scenario disruption fails EV-008 validation | `INVALID_OVERRIDE` |
| A value is outside the allowed range for its parameter | `INVALID_OVERRIDE` |

Rules:

* An invalid override **rejects the whole scenario**. The scenario is never partially mutated.
* There is **no silent correction**. Values are never coerced, clamped or dropped.
* Rejection is reported with the scenario id, the failing override and the reason.

---

## 8. Simulation Time

EV-011 owns time progression inside a run.

| Field | Type | Unit | Meaning |
| --- | --- | --- | --- |
| `start_time` | timestamp | ISO-8601 UTC | Simulated start time, from the scenario |
| `sim_time` | timestamp | ISO-8601 UTC | Current simulated time |
| `duration` | integer | **seconds** | Scenario duration, from the scenario |
| `step_seconds` | integer | **seconds** | Internal execution step, from configuration |

### 8.1 Progression

* Simulation time advances from `start_time` toward `start_time + duration`.
* Internally the engine may use fixed execution steps of `step_seconds` (configuration, default `15`). This is an execution detail.
* Within each step, EV-007 evaluates movement, accumulation and queue service over the elapsed interval, bounded by EV-007's `max_update_interval` (EV-007 §7.6).
* Scheduled events — scenario disruption activation, intervention activation, threshold checks — are applied at their scheduled simulated times, in the deterministic order defined in §17.3.

**Using fixed internal steps does not change EV-007's conceptual event-driven model.** EV-007 remains event-driven and continuous; the simulation supplies discrete evaluation points and the elapsed `Δt` for each.

### 8.2 Termination

A run terminates when any of the following occurs:

| Condition | Resulting status |
| --- | --- |
| `sim_time` reaches `start_time + duration` | `COMPLETED` |
| A configured end condition is met (`stop_on_recovery`, `stop_on_overload_clear`) | `TERMINATED` |
| A configured step limit is exceeded | `TIMEOUT` |
| A configured wall-clock limit is exceeded | `TIMEOUT` |
| An internal execution error occurs | `SIMULATION_FAILURE` |

### 8.3 Deterministic Time Handling

* Time advances only in defined steps and at defined scheduled events, never ad hoc.
* Events at the same simulated time are ordered by the rule in §17.3.
* A run's `duration` in the result always equals `simulated_end_time − simulated_start_time` in seconds.

---

## 9. Execution Loop

```text
Initialize Scenario
       ↓
Validate Scenario and Overrides
       ↓
Copy Baseline into Scenario State
       ↓
Apply Scenario Overrides
       ↓
Initialize Crowd (EV-007)
       ↓
Initialize Disruptions (EV-008 schema, scenario registry)
       ↓
Start Simulation Time
       ↓
┌──────────────────────────────────────┐
│ Evaluate State                        │
│ Propagate Crowd          (EV-007)     │
│ Apply Scheduled Events                │
│ Apply Activated Interventions         │
│ Update State                          │
│ Collect Metrics                       │
│ Record Timeline Entries               │
│ Advance Simulation Time               │
└──────────────────────────────────────┘
       ↓
Continue? ── yes ──► (loop)
       │ no
       ▼
Termination Condition Met
       ↓
Build SimulationResult
```

Validation happens before any state is copied or mutated. A scenario that fails validation never begins execution.

---

## 10. Crowd Execution

Simulation **invokes** EV-007. It does not reimplement it.

| Responsibility | Owner |
| --- | --- |
| Movement, effective speed, movement rate, accumulation, flow, queues, waiting, travel, throughput, utilization, density, overload, crowd states, merge/split, local routing fallback | **EV-007** |
| Supplying scenario graph state, scenario crowd state, scenario disruptions and the elapsed `Δt` | **EV-011** |
| Collecting the resulting metrics and events | **EV-011** |
| Advancing simulation time | **EV-011** |

Rules:

* Simulation **does not duplicate EV-007 formulas**. The canonical movement, accumulation, queue-service and overload rules are executed as defined in EV-007.
* Simulation supplies state and `Δt`; EV-007 returns updated state, metrics and events.
* Simulation never writes graph status, and neither does EV-007. A scenario closure exists only because a scenario override or a scenario disruption's applied effect put it there.

---

## 11. Disruption Execution

Simulation may schedule hypothetical disruptions using the EV-008 model.

| Aspect | Behavior |
| --- | --- |
| Schema | The EV-008 disruption schema, unchanged |
| Identification | `source = SIMULATION`, plus a scenario-specific id (for example `SIM_DISRUPTION_001`) |
| Registry | The scenario registry only. The live registry is never written. |
| Scheduling | A scenario disruption activates in simulated time when `sim_time ≥ start_time` and its lifecycle advances `DETECTED → ACTIVE` |
| Effect application | The same rule as live operation, applied inside the sandbox: a disruption declares `operational_effects`; the **scenario's operational layer** applies them to the scenario copy of the graph, with conflict resolution per EV-008 §10.5 |
| Resolution | `ACTIVE → RESOLVED` at `start_time + expected_duration` when `auto_resolve_on_duration = true`; otherwise on an explicit scenario event |
| Conflicting scenario effects | Resolved by the same deterministic most-restrictive rule as live operation |
| Timeline | Activation and resolution are recorded as timeline entries (§16) |

**EV-008 is not responsible for scenario time.** Scheduling a disruption, advancing the clock, and firing it at the right moment are EV-011 responsibilities.

Tracking issue with EV-008 ownership: EV-011 never changes a disruption's schema, severity or lifecycle rules. It only supplies scheduling and an isolated registry.

**Scenario effect provenance is isolated.** A scenario disruption declares its `operational_effects` using the EV-008 schema unchanged, and the scenario's operational layer records `previous_value`, `applied_value`, `applied_at` and `effect_status` against the **scenario graph copy**. Two consequences follow, and both are required:

* `previous_value` is the value observed **in the scenario state** at the moment the effect is evaluated. It may differ from the live value, because the scenario may already have applied overrides or earlier interventions.
* No scenario effect may modify live provenance or live graph state. The live `operational_effects` records, the live `status_source` values and the live Current Graph are untouched by every simulation run.

Conflict resolution is identical to live operation: the most-restrictive value wins while at least one contributing scenario disruption is `ACTIVE`, and severity never determines precedence (EV-008 §10.5).

---

## 12. Intervention Execution

Simulation executes EV-010 strategies inside the sandbox.

| Aspect | Behavior |
| --- | --- |
| Input | The strategy's `parameter_changes`, passed in `scenario.interventions` |
| Activation time | `intervention_activation_time` (configuration), default = `sim_time` at run start. Scheduled activations are also supported. |
| What changes | Only the parameters in the strategy. Graph parameters (`status`, `capacity`, `throughput_capacity`) are applied to the **scenario graph copy**; `demand_share` entries are applied to the **scenario demand configuration** (§12.1). Nothing is applied to live state. |
| Validation | The same parameter/unit rules as EV-010 §6.2 and EV-006 §10.2 |
| Crowd reaction | EV-007 recomputes availability, routing and metrics under the new scenario configuration — no special-casing |
| Measurement | Metrics are collected over the whole run, and `intervention_impact` compares the run against its control run (§14) |
| Live state | **Never** touched. A simulated strategy is never applied to the Current Graph. |

A scenario with empty `interventions` is a valid scenario and is the **control run** used for `intervention_impact` and for strategy comparison.

### 12.1 Demand Share Execution

`demand_share` is a valid intervention parameter (EV-010 §6.2.1). It is **not** a graph change, so it is executed differently from `status`, `capacity` and `throughput_capacity`.

| Aspect | Behavior |
| --- | --- |
| Where it applies | The **scenario demand configuration**, not the scenario graph copy |
| Shape | One entry per active entry: `target_type = NODE`, `target_id` an EV-006 `active_entries` id, `proposed_value` real in `[0, 1]` |
| Validation | The complete set must sum to `1`, be non-negative, and cover exactly the `active_entries` set of the scenario graph copy. Otherwise `INVALID_OVERRIDE` |
| Effect | EV-007 entrance-generated demand (EV-007 §18.2 source 2) produces arrival batches at the configured shares for the remainder of the run |
| Ownership | EV-007 owns generation and propagation. EV-011 supplies the shares and must not re-derive any EV-007 crowd formula |
| Activation | The same activation semantics as any other intervention (table above) |
| Isolation | Scenario shares never modify `active_entries` in the live graph and never write to live state |

Rebalancing redistributes demand **among** the configured active entries. It never activates a new entry and never mutates graph topology.

---

## 13. Prediction Invocation

Simulation may invoke EV-009 when the scenario or the caller requests it.

| Aspect | Behavior |
| --- | --- |
Simulation may invoke EV-009 when the scenario or the caller requests it. There is **one** prediction system: EV-011 invokes EV-009 and does not implement, wrap or substitute a second predictor.

**What EV-009 receives.** When invoked by EV-011, EV-009 is given the scenario state **explicitly and in full**. It never implicitly reads live operational state.

| Input | Supplied from |
| --- | --- |
| Scenario graph | The scenario graph copy — configuration, `status`, capacities, `active_entries` / `active_exits` |
| Scenario crowd state | Scenario crowd groups and the EV-007 metrics computed inside the sandbox |
| Scenario disruption state | The scenario registry — scenario disruptions and their applied effects |
| Scenario operational parameters | The scenario's operational parameter set (§7.4) |
| Scenario clock and context | `simulated_start_time`, current `sim_time`, scenario id and run id |

| Aspect | Behavior |
| --- | --- |
| Output | Predictions in the EV-009 output schema, unchanged |
| Timestamps | `prediction_time` and `expected_time` use the **scenario clock**, not wall-clock time, wherever simulation time is relevant |
| Scope | Scenario-scoped. Scenario predictions never overwrite or enter live prediction history. |
| Isolation | No implicit read of live state and no mutation of live state. A scenario prediction cannot alter live crowd state, live graph state, live disruption state or live effect provenance. |
| Promotion | Scenario predictions are never promoted automatically. Promotion requires an explicit separate system action outside EV-011. |
| Failure | **Prediction failure does not fail the simulation**, unless the scenario explicitly sets `require_prediction = true`, in which case a failed prediction yields `SIMULATION_FAILURE`. A `NO_PREDICTION` status is a valid response and does not fail the run unless `require_prediction = true`. |

Prediction invocation is optional. A scenario that does not request predictions runs normally, and the reason is recorded in the result warnings.

---

## 14. Metrics

Simulation returns measurable outcomes. **Every metric below is an aggregate of an EV-007 value, or an aggregate defined only by simulation time.** No EV-007 metric definition is redefined here.

### 14.1 Metric Definitions

| Metric | Definition | Unit | Scope |
| --- | --- | --- | --- |
| `population` | EV-007 `global_population` at the end of the run | people | Event |
| `occupancy` | EV-007 `occupancy`, peak value observed at the requested scope | people | Node, Edge |
| `flow` | EV-007 `flow`, peak value observed at the requested scope | people/minute | Edge |
| `density` | EV-007 `density`, peak value observed at the requested scope | dimensionless | Node, Edge |
| `queue_size` | EV-007 `queue_size`, peak value observed at the requested scope | people | Node |
| `waiting_time` | EV-007 `waiting_time`, mean over the run at the requested scope | seconds | Node, Group, Event |
| `travel_time` | EV-007 `travel_time`, mean over the run at the requested scope | seconds | Edge, Group, Event |
| `arrived_population` | EV-007 `arrived_population`, cumulative at the end of the run | people | Event |
| `diverted_population` | Summed population of groups whose state became `DIVERTED` during the run, from EV-007 `diverted` events | people | Event |
| `congestion` | EV-007 `density` at the requested scope, **final** value at the end of the run | dimensionless | Node, Edge |
| `capacity_utilization` | EV-007 `utilization` at the requested scope, peak value observed | dimensionless | Node, Edge |
| `throughput` | EV-007 `throughput` / `arrival_rate`, mean over the run at the requested scope | people/minute | Node, Edge, Event |
| `intervention_impact` | `metric(with intervention) − metric(control run)` for a chosen metric. Requires a control run. | unit of the compared metric | Event |
| `time_to_congestion` | Elapsed simulated time from run start to the first moment `density` crosses `congestion_threshold` at the scope; `null` if never crossed | seconds | Node, Edge, Event |
| `peak_congestion` | Maximum `density` observed at the scope | dimensionless | Node, Edge, Event |
| `peak_queue` | Maximum `queue_size` observed at the scope | people | Node, Event |
| `recovery_time` | Elapsed time from the first `congestion_threshold` crossing to the first moment the scope has stayed below `recovery_threshold` for `recovery_hold` consecutive seconds; `null` if never crossed or never recovered | seconds | Node, Edge, Event |
| `duration` | Simulated duration actually executed: `simulated_end_time − simulated_start_time` | seconds | Event |

### 14.2 Metric Notes

* **Peak vs final.** `peak_*` metrics are maxima; `congestion` is the final value; `waiting_time` and `travel_time` are means. Each metric's aggregation is stated in its definition so a consumer never has to guess.
* **`congestion` and `capacity_utilization` are numerically identical at the same scope.** EV-007 defines `density` as the load ratio, which is exactly EV-007 `utilization` (holding utilization at a node, flow utilization at an edge). Both names are published because EV-010's objective language uses "congestion" while operational reporting uses "capacity utilization". The load ratio is computed **once**; no second formula exists.
* **`diverted_population`** is a simulation-level aggregate of EV-007 `diverted` events, not a new crowd formula.
* **`intervention_impact`** is defined only against a paired control run. Without a control run it is `null`.
* Threshold configuration: `congestion_threshold` (default: the EV-007 `density_critical_threshold`), `recovery_threshold` (default `1.0`), `recovery_hold` (default `60` seconds).

### 14.3 Scoped Metric Record

Metrics crossing the **EV-011 → EV-010** interface are returned as scoped records, so a value is always interpretable without inference. The run-level `metrics` object (§15.1) remains a convenience summary; the scoped record is the interface contract.

| Field | Type | Meaning |
| --- | --- | --- |
| `metric` | enum | A metric name from §14.1 |
| `target_type` | enum | `NODE`, `EDGE`, `GROUP`, `EVENT` |
| `target_id` | string \| null | The entity id; `null` only when `target_type = EVENT` |
| `aggregation` | enum | `PEAK`, `FINAL`, `MEAN`, `SUM`, `FIRST`, `DELTA` |
| `value` | number \| null | The measured value in the metric's canonical unit; `null` when not applicable (for example an uncrossed `time_to_congestion`) |
| `unit` | enum | `people`, `people/minute`, `metres`, `metres/second`, `seconds`, `dimensionless` |

`aggregation` is fixed per metric and must agree with the §14.1 definition:

| `aggregation` | Metrics |
| --- | --- |
| `PEAK` | `occupancy`, `flow`, `density`, `queue_size`, `capacity_utilization`, `peak_congestion`, `peak_queue` |
| `FINAL` | `congestion`, `population`, `duration` |
| `MEAN` | `waiting_time`, `travel_time`, `throughput` |
| `SUM` | `arrived_population`, `diverted_population` |
| `FIRST` | `time_to_congestion`, `recovery_time` |
| `DELTA` | `intervention_impact` |

Rules:

* Every metric consumed by EV-010 must be scope-qualified. A metric name alone is never sufficient.
* `unit` is fixed per metric, so a returned value is never ambiguous.
* No new metric is defined here. §14.3 is a transport shape for §14.1 values.
* Physical density in `people/m²` is not used anywhere and is not a valid unit.

Example:

```json
[
  { "metric": "peak_queue",   "target_type": "NODE",  "target_id": "CHECKPOINT_01",
    "aggregation": "PEAK",  "value": 400,   "unit": "people" },
  { "metric": "peak_congestion", "target_type": "NODE", "target_id": "ZONE_01",
    "aggregation": "PEAK",  "value": 0.960, "unit": "dimensionless" },
  { "metric": "throughput",   "target_type": "EVENT", "target_id": null,
    "aggregation": "MEAN",  "value": 62,    "unit": "people/minute" },
  { "metric": "time_to_congestion", "target_type": "NODE", "target_id": "ZONE_01",
    "aggregation": "FIRST", "value": null,  "unit": "seconds" }
]
```

---

## 15. Result Schema and Status

### 15.1 SimulationResult Schema

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | Required | `SIMULATION_RESULT_<NUMBER>` |
| `scenario_id` | string | Required | The executed scenario |
| `strategy_id` | string \| null | Required | Set when the run evaluates an EV-010 strategy |
| `status` | enum | Required | §15.2 |
| `baseline` | enum | Required | Baseline used |
| `baseline_ref` | string \| null | Required | Reference when `baseline = CAPTURED_STATE` |
| `seed` | integer | Required | Simulation seed actually used (§17) |
| `simulated_start_time` | timestamp | Required | ISO-8601 UTC |
| `simulated_end_time` | timestamp | Required | ISO-8601 UTC |
| `duration` | integer | Required | Executed duration in **seconds** |
| `metrics` | object | Required | Run-level §14 summary values |
| `scoped_metrics` | object[] | Required | §14.3 scope-qualified metric records; the shape EV-010 consumes |
| `final_state` | object | Required | Summary of final crowd state: population, overloaded nodes and edges, active scenario disruptions, open/closed status of affected entities |
| `events` | object[] | Required | EV-007 events plus simulation events |
| `warnings` | object[] | Required | Non-fatal issues, each with a machine-readable code |
| `timeline` | object[] | Required | §16 |

### 15.2 Status Values

| `status` | Meaning | `metrics` valid? | Downstream may continue? |
| --- | --- | --- | --- |
| `COMPLETED` | Ran to the configured duration | Yes, complete | Yes |
| `TERMINATED` | Ended early by a configured end condition. Partial | Yes, over the executed duration; flagged partial | Yes, only if the consumer accepts partial results (EV-010 §12.3) |
| `INVALID_SCENARIO` | Scenario failed validation before execution | No | No — nothing was executed |
| `INVALID_OVERRIDE` | An override failed validation; scenario rejected atomically | No | No — no partial scenario state exists |
| `SIMULATION_FAILURE` | Internal execution error | No — partial metrics are not meaningful | No — the timeline is retained for diagnostics only |
| `TIMEOUT` | Step limit or wall-clock limit exceeded. Partial | Yes, up to the last completed step; flagged partial | Only if the consumer accepts partial results |

### 15.3 Example

```json
{
  "id": "SIMULATION_RESULT_03",
  "scenario_id": "SCENARIO_03",
  "strategy_id": "STRATEGY_03",
  "status": "COMPLETED",
  "baseline": "CURRENT_GRAPH",
  "baseline_ref": null,
  "seed": 42,
  "simulated_start_time": "2026-09-19T19:01:00Z",
  "simulated_end_time": "2026-09-19T19:11:00Z",
  "duration": 600,
  "metrics": {
    "population": 1300,
    "occupancy": 9600,
    "flow": 60,
    "density": 0.33,
    "queue_size": 400,
    "waiting_time": 180,
    "travel_time": 128,
    "arrived_population": 620,
    "diverted_population": 940,
    "congestion": 0.940,
    "capacity_utilization": 0.960,
    "throughput": 62,
    "intervention_impact": null,
    "time_to_congestion": null,
    "peak_congestion": 0.960,
    "peak_queue": 400,
    "recovery_time": null,
    "duration": 600
  },
  "final_state": {
    "population": 1300,
    "overloaded_nodes": [],
    "overloaded_edges": [],
    "active_scenario_disruptions": [],
    "affected_entity_status": { "EXIT_01": "OPEN", "GATE_01": "CLOSED" }
  },
  "events": [],
  "warnings": [
    { "code": "PREDICTION_NOT_REQUESTED", "message": "Scenario did not request prediction invocation." }
  ],
  "timeline": []
}
```

Units matter here: `occupancy`, `queue_size`, `population`, `arrived_population` and `diverted_population` are **people**; `flow` and `throughput` are **people/minute**; `waiting_time`, `travel_time`, `time_to_congestion`, `recovery_time` and `duration` are **seconds**; `density`, `congestion` and `capacity_utilization` are **dimensionless**.

Scope matters too, because `metrics` is a flat object holding values measured at different entities. In this example `occupancy` and `congestion` are `ZONE_01`, `queue_size` and `waiting_time` are `CHECKPOINT_01`, and `flow` and `density` are `EDGE_06`. A consumer that needs per-entity breakdowns rather than aggregates reads `timeline` and the `timeline`/`events` entries, which are always target-qualified, or issues a per-scope metric request; the flat object is the run-level summary, not a substitute for per-entity detail.

---

## 16. Timeline

The timeline captures **meaningful events only**. It is not a log of every numerical update.

| Field | Type | Meaning |
| --- | --- | --- |
| `sim_time` | timestamp | Simulated time of the event |
| `type` | enum | The event type below |
| `target_type` | enum \| null | `NODE`, `EDGE`, `GROUP`, `EVENT` |
| `target_id` | string \| null | Target id where applicable |
| `detail` | object | Event-specific values, in canonical units |

| `type` | Recorded when |
| --- | --- |
| `DISRUPTION_ACTIVATED` | A scenario disruption becomes `ACTIVE` |
| `DISRUPTION_RESOLVED` | A scenario disruption becomes `RESOLVED` |
| `INTERVENTION_ACTIVATED` | A scenario intervention is applied |
| `THRESHOLD_CROSSED` | A configured threshold is crossed |
| `OVERLOAD` | A node or edge becomes overloaded |
| `OVERLOAD_CLEARED` | A node or edge leaves overload |
| `DIVERSION` | A group begins executing a non-preferred route |
| `ARRIVAL` | A group reaches its destination |
| `RECOVERY` | A scope recovers below `recovery_threshold` for `recovery_hold` |
| `TERMINATION` | The run terminates, with the terminating condition |

Rule: an event is added only when it changes the operational interpretation of the run. Per-step metric values are captured in `metrics`, not in the timeline.

---

## 17. Determinism

### 17.1 Requirement

The same baseline, the same scenario, the same inputs, the same configuration and the same seed **must produce the same `SimulationResult`**.

### 17.2 Seeds

* The seed is **externally supplied** by the caller and recorded in the result.
* The seed belongs to simulation execution, not to EV-007.
* MVP crowd logic is deterministic and requires no randomness. A seed is used only when stochastic demand is configured.
* The simulator must not generate its own seed.

### 17.3 Ordering

For reproducibility, execution order is fixed:

1. Scheduled events are ordered by `sim_time`.
2. Events at the same `sim_time` are ordered by: `INTERVENTION_ACTIVATED`, `DISRUPTION_ACTIVATED`, `DISRUPTION_RESOLVED`, then threshold checks, then crowd propagation, then timeline recording.
3. Entities within a step are processed in ascending id order.
4. Scenario disruptions with the same `start_time` are activated in ascending `id` order.

### 17.4 Reproducibility Practice

MVP prefers deterministic behavior. Randomness is not required, and enabling it must be an explicit configuration choice.

---

## 18. Strategy Comparison

Simulation defines how two or more strategies are compared.

### 18.1 Comparability Requirements

All strategies in a comparison must use:

| Requirement | Meaning |
| --- | --- |
| Common baseline | The same `baseline` and `baseline_ref` |
| Same configuration | Same `step_seconds`, thresholds, durations and metric scopes |
| Same duration | Identical `duration` |
| Same metric definitions | The §14 metric set |
| Same seed | The same `seed`, so stochastic inputs are identical |

A comparison that violates any requirement is invalid, and the comparison result must say so rather than silently comparing incomparable runs.

### 18.2 Comparison Output

```text
ComparisonResult
├── baseline / baseline_ref
├── seed
├── duration
├── scenarios[]        scenario id, strategy id, status
├── metric_matrix      metric × scenario values, in canonical units
├── deltas             per-strategy difference against the control run
└── warnings           incomparability and partial-result notices
```

Rules:

* The comparison exposes **raw measurable outcomes**. It never hides them behind an unexplained score.
* Ranking of strategies is **not** performed here. Ranking belongs to EV-010. EV-011 reports measurements only.
* A scenario that did not complete is shown with its status and excluded from `deltas`.

---

## 19. Optimization Interface

### 19.1 Request

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `request_id` | string | Required | Correlates the request with the result |
| `scenario` | object | Required | §6 |
| `strategy_id` | string \| null | Optional | Set when evaluating an EV-010 strategy |
| `seed` | integer | Required | Simulation seed |
| `requested_metrics` | object[] | Required | §14.3 metric selectors the caller needs: `{ metric, target_type, target_id }` |
| `with_control_run` | boolean | Optional | When `true`, the simulator also runs the same scenario with empty `interventions` to compute `intervention_impact`. Default `true` when `strategy_id` is set. |
| `require_prediction` | boolean | Optional | When `true`, a failed prediction invocation fails the run. Default `false`. |

### 19.2 Response

| Field | Type | Meaning |
| --- | --- | --- |
| `result_id` | string | The `SimulationResult.id` |
| `status` | enum | §15.2 |
| `metrics` | object | §14 — run-level summary values |
| `scoped_metrics` | object[] | §14.3 — scope-qualified records. **This is the field EV-010 consumes for objectives and constraints.** |
| `intervention_impact` | object \| null | Per-metric deltas against the control run (`aggregation = DELTA`) |
| `warnings` | object[] | Non-fatal issues |
| `timeline` | object[] | §16 |
| `control_result_id` | string \| null | The control run's result id, when one was executed |

### 19.3 Failure Contract

**Simulation failure is explicitly returned to Optimization.** EV-011 never substitutes a default or assumed outcome.

| Situation | Returned to EV-010 |
| --- | --- |
| `COMPLETED` | Full metrics and timeline |
| `TERMINATED` | Partial metrics, flagged partial |
| `TIMEOUT` | Partial metrics up to the last completed step, flagged partial |
| `INVALID_SCENARIO` | No metrics; reason returned. EV-010 records the strategy as un-evaluated. |
| `INVALID_OVERRIDE` | No metrics; reason returned. EV-010 records the strategy as un-evaluated. |
| `SIMULATION_FAILURE` | No metrics; reason returned, with the partial timeline for diagnostics |

EV-010's handling of each case is defined in EV-010 §12.3.

---

## 20. Failure Handling

| Failure | Returned | Partial results valid? | Downstream may continue? |
| --- | --- | --- | --- |
| Invalid scenario | `INVALID_SCENARIO` with reason | No | No |
| Invalid override | `INVALID_OVERRIDE` with reason | No | No |
| Runtime error during execution | `SIMULATION_FAILURE` with reason and partial timeline for diagnostics | No | No |
| Step or wall-clock limit exceeded | `TIMEOUT` with the last completed step | Yes, explicitly flagged partial | Only if the consumer accepts partial results |
| Configured end condition met | `TERMINATED` with the terminating condition | Yes, explicitly flagged partial | Only if the consumer accepts partial results |
| Prediction invocation failure | Recorded as a warning when `require_prediction = false`; `SIMULATION_FAILURE` when `require_prediction = true` | Yes | Yes when only a warning |
| Metric not computable at the requested scope | Metric reported as `null` with a warning | Yes | Yes |

Rules:

* Failure is never silent. Every non-`COMPLETED` result carries a machine-readable reason.
* An invalid scenario **never** begins execution, so it cannot leave partial state.
* Invalid overrides reject the scenario atomically; there is no partial application and no silent correction.
* A failed run is never converted into an assumed result.

---

## 21. Domain Boundary

| Concern | Owner |
| --- | --- |
| Graph topology, configuration and authoritative status | EV-006 |
| Crowd representation, movement, queues, metrics | EV-007 |
| Disruption schema, severity, lifecycle, declared effects | EV-008 |
| Forecasting | EV-009 |
| Strategy generation, feasibility, objectives, ranking | EV-010 |
| **Scenario schema, scenario state, simulation time, overrides, interventions execution, metrics collection, timeline, simulation result, strategy comparison** | **EV-011** |
| Authorization and application of live changes | Operational layer |

### 21.1 Explicit Non-Behaviours

* EV-011 does not define graph topology or capacities. It copies and overrides them.
* EV-011 does not define crowd behaviour. It executes EV-007.
* EV-011 does not define the disruption schema. It schedules scenario disruptions using EV-008's schema.
* EV-011 does not forecast. It may invoke EV-009.
* EV-011 does not generate, filter or rank strategies. It evaluates supplied strategies and reports measurements.
* EV-011 never mutates the Initial Graph, the Current Graph, live crowd state, the live disruption registry, live operational parameters or live prediction history.
* EV-011 never promotes a result into live state.

---

## 22. MVP Requirements

| Requirement | MVP behavior |
| --- | --- |
| Question answered | "What happens if we execute this scenario?" |
| Isolation | Every run executes an isolated scenario copy; live state is never mutated |
| Baseline | `INITIAL_GRAPH`, `CURRENT_GRAPH` or `CAPTURED_STATE`, copied at creation |
| Scenario schema | Exact schema with graph, crowd, disruption and operational-parameter overrides plus interventions |
| Overrides | Validated before execution; invalid overrides reject the scenario atomically with no silent correction |
| Time | EV-011 owns time; fixed internal steps bounded by EV-007's `max_update_interval`; deterministic ordering |
| Crowd | EV-007 executed as defined; no duplicated crowd formulas |
| Disruptions | EV-008 schema, `source = SIMULATION`, isolated registry, sandbox effect application |
| Interventions | EV-010 parameter changes applied to the scenario copy only |
| Prediction | Optional invocation on scenario state; scenario-scoped; failure does not fail the run unless required |
| Metrics | 18 metrics with explicit definitions, units and scopes |
| Result | `SimulationResult` with status, metrics, final state, events, warnings and timeline |
| Timeline | Meaningful events only, never per-step numerical updates |
| Determinism | Same baseline, scenario, inputs, configuration and seed produce the same result |
| Comparison | Common baseline, configuration, duration, metric definitions and seed; raw outcomes exposed |
| Handoff | Explicit request/response contract; simulation failure returned explicitly to EV-010 |
| Complexity | Deterministic, explainable, bounded; no agents, no RL, no distributed infrastructure |

---

## 23. Example

This example completes the end-to-end thread from EV-006 §18, EV-007 §27, EV-008 §27, EV-009 §16 and EV-010 §18.

### 23.1 Runs Submitted

EV-010 submits four feasible candidates as scenarios on `baseline = CURRENT_GRAPH`, `duration = 600` seconds, `seed = 42`.

```text
SCENARIO_01  STRATEGY_01  interventions: none (control run)
SCENARIO_02  STRATEGY_02  interventions: EXIT_01 status CLOSED -> OPEN
SCENARIO_03  STRATEGY_03  interventions: EXIT_01 status CLOSED -> OPEN
                                         demand share TRANSIT_01 = 1.0, GATE_01 = 0.0
SCENARIO_04  STRATEGY_04  interventions: demand share TRANSIT_01 = 1.0, GATE_01 = 0.0
```

`GATE_01` and `CHECKPOINT_01` are disruption-locked, so no scenario can reopen the gate or raise the checkpoint service rate. `EXIT_01` is available for intervention.

### 23.2 Metric Matrix

Every metric in §14 is scope-qualified, and the scopes differ between columns of this matrix:

| Column group | Scope | Relevant configured value |
| --- | --- | --- |
| `occupancy`, `congestion`, `capacity_utilization`, `peak_congestion` | `ZONE_01` | holding capacity `10,000` people |
| `queue_size`, `waiting_time`, `peak_queue` | `CHECKPOINT_01` | holding capacity `400` people, service rate `60` people/minute |
| `flow`, `density` | `EDGE_06` | flow capacity `180` people/minute |
| `population`, `arrived_population`, `diverted_population` | event | — |

| Metric | Unit | Scope | `SCENARIO_01` (control) | `SCENARIO_02` | `SCENARIO_03` | `SCENARIO_04` |
| --- | --- | --- | --- | --- | --- | --- |
| `population` | people | event | 1180 | 1240 | **1300** | 1220 |
| `occupancy` (peak) | people | `ZONE_01` | 10240 | 9900 | **9600** | 10180 |
| `flow` (peak) | people/minute | `EDGE_06` | 60 | 60 | 60 | 60 |
| `density` (peak) | dimensionless | `EDGE_06` | 0.33 | 0.33 | 0.33 | 0.33 |
| `queue_size` (peak) | people | `CHECKPOINT_01` | 400 | 400 | **400** | 400 |
| `waiting_time` (mean) | seconds | `CHECKPOINT_01` | 310 | 250 | **180** | 285 |
| `travel_time` (mean) | seconds | event | 165 | 142 | **128** | 158 |
| `arrived_population` | people | event | 480 | 550 | **620** | 510 |
| `diverted_population` | people | event | 1180 | 1020 | **940** | 1120 |
| `congestion` (final) | dimensionless | `ZONE_01` | 0.990 | 0.980 | **0.940** | 0.995 |
| `capacity_utilization` (peak) | dimensionless | `ZONE_01` | 1.024 | 0.990 | **0.960** | 1.018 |
| `throughput` (mean) | people/minute | event | 48 | 55 | **62** | 51 |
| `time_to_congestion` | seconds | `ZONE_01` | 240 | null | **null** | 300 |
| `peak_congestion` | dimensionless | `ZONE_01` | 1.024 | 0.990 | **0.960** | 1.018 |
| `peak_queue` | people | `CHECKPOINT_01` | 400 | 400 | **400** | 400 |
| `recovery_time` | seconds | `ZONE_01` | 240 | null | **null** | 270 |
| `duration` | seconds | — | 600 | 600 | 600 | 600 |
| `status` | enum | — | `COMPLETED` | `COMPLETED` | `COMPLETED` | `COMPLETED` |

Thresholds used: `congestion_threshold = 1.00`, `recovery_threshold = 1.00`, `recovery_hold = 60` seconds.

Internal consistency of the matrix:

```text
congestion = occupancy / capacity, capacity (ZONE_01) = 10,000 people
    SCENARIO_01  10240 / 10000 = 1.024     SCENARIO_02   9900 / 10000 = 0.990
    SCENARIO_03   9600 / 10000 = 0.960     SCENARIO_04  10180 / 10000 = 1.018

capacity_utilization (peak) = peak_congestion
    same defined quantity at a node scope: 1.024, 0.990, 0.960, 1.018

peak value >= final value, for every scope
    SCENARIO_01   1.024 >= 0.990          SCENARIO_02  0.990 >= 0.980
    SCENARIO_03   0.960 >= 0.940          SCENARIO_04  1.018 >= 0.995

density (EDGE_06) = peak flow / capacity
    60 / 180 = 0.33 for every scenario

throughput = arrived_population / (duration / 60)
    SCENARIO_01  480 / 10 = 48.0      SCENARIO_02  550 / 10 = 55.0
    SCENARIO_03  620 / 10 = 62.0      SCENARIO_04  510 / 10 = 51.0

time_to_congestion = first moment congestion >= congestion_threshold (1.00)
    SCENARIO_01  1.024 crosses -> 240          SCENARIO_02  0.990 never -> null
    SCENARIO_03  0.960 never -> null           SCENARIO_04  1.018 crosses -> 300

recovery_time = first moment the scope stayed below recovery_threshold
                for recovery_hold, minus the first crossing
    SCENARIO_01  below from 420, held 60 -> confirmed 480;  480 - 240 = 240
    SCENARIO_02  never crossed -> null
    SCENARIO_03  never crossed -> null
    SCENARIO_04  below from 510, held 60 -> confirmed 570;  570 - 300 = 270
```

Two consequences of the disruption lock are visible in this matrix, and both are expected rather than defects:

* **`flow`, `density` and `queue_size` are identical across all four scenarios.** They are bounded by the disruption-locked `CHECKPOINT_01` service rate of `60` people/minute. No strategy can raise that service rate (EV-010 C1), and `EDGE_05` gives the checkpoint no inflow, so its queue can only drain from its `400`-person starting value. `SCENARIO_01` and `SCENARIO_03` are therefore genuinely different strategies that produce identical values on these three metrics. A comparison must report that honestly instead of inventing a difference.
* **`arrived_population`, `waiting_time`, `travel_time` and `congestion` do differ**, because they are governed by egress through `EXIT_01`, which is not disruption-locked and which `STRATEGY_02`, `STRATEGY_03` and `STRATEGY_04` change in different ways. These are the four metrics that actually discriminate between the candidates.

`time_to_congestion` and `recovery_time` are `null` for `SCENARIO_02` and `SCENARIO_03` for a single reason: their peak congestion (`0.990` and `0.960`) never reaches the `1.00` threshold, so the clock never starts. `null` here means "never congested", which is the best outcome in this comparison, not missing data. EV-010 §11 treats the two cases differently when ranking, and §18.5 of that document records the resulting zero-width range for `peak_queue`.

### 23.3 Control Run and Intervention Impact

`SCENARIO_01` carries no interventions and acts as the control run. `intervention_impact` for `SCENARIO_03`:

```text
occupancy (peak, ZONE_01)  9600 - 10240 = -640 people
peak_congestion            0.960 - 1.024 = -0.064 dimensionless
waiting_time               180 - 310 = -130 seconds
travel_time                128 - 165 = -37 seconds
throughput                 62 - 48 = +14 people/minute
peak_queue (CHECKPOINT_01) 400 - 400 = 0 people
```

Negative values mean the intervention reduced the metric; the positive throughput value means it increased delivery. All values carry the unit of the metric they compare.

The final `peak_queue` row is `0` — an exact tie. `STRATEGY_03` did not change checkpoint queueing at all, and the comparison says so rather than attributing part of the improvement to a metric the intervention never touched. An operator reading this impact table learns precisely which four quantities the approved change is responsible for, and which one it is not.

### 23.4 Timeline for `SCENARIO_03`

```json
[
  { "sim_time": "2026-09-19T19:01:00Z", "type": "INTERVENTION_ACTIVATED",
    "target_type": "NODE", "target_id": "EXIT_01",
    "detail": { "parameter": "status", "previous_value": "CLOSED", "proposed_value": "OPEN" } },
  { "sim_time": "2026-09-19T19:04:00Z", "type": "DIVERSION",
    "target_type": "GROUP", "target_id": "CG_02",
    "detail": { "reason": "preferred route through GATE_01 unavailable",
                "diverted_population": 300 } },
  { "sim_time": "2026-09-19T19:08:30Z", "type": "ARRIVAL",
    "target_type": "GROUP", "target_id": "CG_01",
    "detail": { "population": 500, "destination": "ZONE_01" } },
  { "sim_time": "2026-09-19T19:11:00Z", "type": "TERMINATION",
    "target_type": null, "target_id": null,
    "detail": { "condition": "DURATION_REACHED" } }
]
```

No per-step numerical update appears in the timeline; those live in `metrics`.

### 23.5 Comparison

```json
{
  "baseline": "CURRENT_GRAPH",
  "baseline_ref": null,
  "seed": 42,
  "duration": 600,
  "control_scenario_id": "SCENARIO_01",
  "scenarios": [
    { "scenario_id": "SCENARIO_01", "strategy_id": "STRATEGY_01", "status": "COMPLETED" },
    { "scenario_id": "SCENARIO_02", "strategy_id": "STRATEGY_02", "status": "COMPLETED" },
    { "scenario_id": "SCENARIO_03", "strategy_id": "STRATEGY_03", "status": "COMPLETED" },
    { "scenario_id": "SCENARIO_04", "strategy_id": "STRATEGY_04", "status": "COMPLETED" }
  ],
  "deltas": {
    "SCENARIO_03": { "peak_queue": -260, "peak_congestion": -0.69, "waiting_time": -130,
                     "travel_time": -37, "throughput": 14 }
  },
  "warnings": []
}
```

The comparison exposes raw outcomes and deltas. It does **not** rank the strategies — EV-010 ranks them using its objective function. EV-010's resulting ranking is `STRATEGY_03`, `STRATEGY_02`, `STRATEGY_04`, `STRATEGY_01`.

### 23.6 Handoff and Application

```text
EV-011 returns SimulationResult + intervention_impact to EV-010
        │
        ▼
EV-010 computes J and ranks (EV-010 §18)
        │
        ▼
Operator approves STRATEGY_03
        │
        ▼
Operational layer applies the authorized change
        │
        ▼
EV-006 Current Graph   EXIT_01.status = OPEN, status_source = INTERVENTION
        │
        ▼
EV-007 Crowd reacts under the new configuration
```

**Boundary check:** EV-011 executed four isolated scenarios, mutated no live state, defined no crowd behaviour, ranked nothing, and returned measurements with explicit units plus an explicit status for every run.

---

## 24. Architectural Summary

EV-011 is the sandbox and digital-twin layer. It copies state, executes time, invokes EV-007 and optionally EV-009, collects metrics, and returns measurable, reproducible outcomes.

Key invariants:

* Simulation answers "what happens if we execute this scenario?" and never applies anything to live operations.
* Every run executes an isolated scenario copy. The Initial Graph, the Current Graph, live crowd state, the live disruption registry, live operational parameters and live prediction history are never mutated.
* A baseline is selected, recorded and copied; `CURRENT_GRAPH` is the default for live decision support.
* Overrides are validated before execution and reject the scenario atomically. There is no silent correction.
* EV-011 owns simulation time. Fixed internal steps are bounded by EV-007's `max_update_interval` and do not change EV-007's event-driven model.
* EV-007 is executed, never reimplemented. No crowd formula is duplicated.
* Scenario disruptions reuse the EV-008 schema with `source = SIMULATION`, live in an isolated registry, and resolve conflicts by the same deterministic most-restrictive rule.
* Interventions change only scenario state. A simulated strategy is never applied to the Current Graph.
* Prediction is optional, scenario-scoped, and does not fail the run unless the scenario requires it.
* Metrics are aggregates of EV-007 values or simulation-time aggregates, each with an explicit definition, unit and scope. `congestion` and `capacity_utilization` are the same load ratio, computed once and published under two names.
* Determinism is required: the same baseline, scenario, inputs, configuration and seed produce the same result, with a fixed event ordering.
* Comparison requires a common baseline, configuration, duration, metric definitions and seed, and exposes raw outcomes rather than a hidden score.
* Simulation failure is explicit across six statuses, with partial-result validity stated for each.
* A simulation result is never promoted to live state automatically.
