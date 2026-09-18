# EV-009 — Prediction

**Document ID:** EV-009
**Domain:** Prediction
**Status:** MVP Specification
**Depends On:** EV-006 Graph Model, EV-007 Crowd Model, EV-008 Disruption Model
**Consumed By:** EV-010 Optimization, EV-011 Simulation

**Purpose:** Forecast future crowd and operational conditions using current system state, disruptions, historical information, and machine-learning models.

---

## 1. Purpose

The Prediction Model estimates what is likely to happen next in the EventFlow environment.

```text
Current State
     +
Historical Context
     +
Disruptions
     ↓
Prediction
```

EV-009 answers exactly one question: **"What is likely to happen next?"**

It does **not** answer "What should we do?" — that is EV-010.

Prediction describes **likely future conditions**. It never selects, ranks or applies an intervention.

---

## 2. Scope

### 2.1 In Scope

* future flow rate
* future waiting and travel time
* future node or edge congestion
* future node or edge unavailability
* configurable prediction horizon
* prediction confidence
* prediction refresh, invalidation and staleness
* human-readable prediction explanation
* the prediction output contract consumed by EV-010 and EV-011

### 2.2 Out of Scope

| Concern | Owner |
| --- | --- |
| Current crowd state and crowd metrics | EV-007 |
| Graph configuration and authoritative status | EV-006 |
| Disruption identity, severity, lifecycle | EV-008 |
| Strategy generation, constraints, ranking | EV-010 |
| Scenario execution and time progression | EV-011 |
| Applying live operational changes | Operational layer |

EV-009 **never mutates** graph state, crowd state, the disruption registry, or any other domain's data. It is a read-only forecasting layer that publishes predictions.

### 2.3 Position in the Chain

```text
EV-006 Graph        → What exists, and what is operationally available
EV-007 Crowd        → What is happening now
EV-008 Disruption   → What changed
EV-009 Prediction   → What is likely to happen next
EV-010 Optimization → What could/should be changed
EV-011 Simulation   → What happens under a scenario
```

---

## 3. Prediction Targets

### 3.1 Target Model

```text
target_type ∈ { NODE, EDGE, EVENT }
target_id   =  EV-006 node id, EV-006 edge id, or null when target_type = EVENT
```

* `NODE` targets use EV-006 node identifiers.
* `EDGE` targets use EV-006 edge identifiers.
* `EVENT` targets describe a whole-event aggregate metric and carry `target_id = null`.
* EV-009 defines no spatial objects of its own and does not duplicate the graph.

### 3.2 Metric Enum

The MVP metric set is **closed**. No other metrics are predicted.

| `metric` | Unit | Scope | Why it exists |
| --- | --- | --- | --- |
| `flow` | **people/minute** | `NODE`, `EDGE` | Objective term in EV-010 |
| `waiting_time` | **seconds** | `NODE` | Objective term in EV-010 |
| `travel_time` | **seconds** | `EDGE` | Objective term in EV-010 |
| `congestion` | **dimensionless** (EV-007 `density` load ratio) | `NODE`, `EDGE` | Objective term in EV-010 |
| `queue_size` | **people** | `NODE` | Objective term in EV-010 |
| `availability` | **enum**: `AVAILABLE`, `UNAVAILABLE` | `NODE`, `EDGE` | Constraint input for EV-010 |

Each metric exists because EV-010 has a corresponding objective term or constraint. Metrics with no consumer are not predicted.

Two deliberate choices:

* **`availability` is an enum, not a probability.** MVP has no calibrated probability model, and a probability would be indistinguishable from `confidence` to a consumer. EV-009 therefore reports a definite predicted availability state plus a separate confidence value.
* **`congestion` is the EV-007 `density` load ratio**, a dimensionless value. It is never expressed as people per square metre, because EV-006 defines no node area.

### 3.3 Horizon

The horizon is the distance into the future that a prediction refers to.

| Field | Type | Required | Unit | Meaning |
| --- | --- | --- | --- | --- |
| `horizon` | integer | Required | **seconds** | Time from the prediction moment to the predicted moment |

```text
expected_time = prediction_time + horizon
```

Rules:

* The horizon is **configurable per request**, not fixed in the model.
* MVP supports short horizons. `min_horizon` and `max_horizon` are configuration (defaults: 60 and 900 seconds).
* A horizon outside the configured range produces `NO_PREDICTION` with reason `HORIZON_OUT_OF_RANGE`.
* Repeated updates are supported: the same target and metric may be predicted many times as state changes. Newer predictions supersede older ones (§10).

### 3.4 Prediction Request

```json
{
  "request_id": "PRED_REQ_0001",
  "target_type": "NODE",
  "target_id": "CHECKPOINT_01",
  "metric": "waiting_time",
  "horizon": 300,
  "requested_at": "2026-09-19T19:01:00Z",
  "allow_history": false
}
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `request_id` | string | Required | Correlates the request with the returned prediction |
| `target_type` | enum | Required | `NODE`, `EDGE`, `EVENT` |
| `target_id` | string \| null | Required | Entity id; `null` only when `target_type = EVENT` |
| `metric` | enum | Required | One of the six metrics in §3.2 |
| `horizon` | integer | Required | Seconds into the future |
| `requested_at` | timestamp | Required | ISO-8601 UTC |
| `allow_history` | boolean | Optional | Defaults to `false`. See §10 |

---

## 4. Input Contract

EV-009 may consume the following inputs. **Prediction does not modify any of these inputs.**

### 4.1 From EV-006 Graph

* graph topology and configuration
* node and edge `status` (`OPEN` / `CLOSED`)
* node `capacity` (people, holding)
* node `throughput_capacity` (people/minute, service rate)
* edge `capacity` (people/minute, flow capacity)
* edge `distance` (metres), `baseline_time` and `current_time` (seconds)
* `active_entries` and `active_exits`
* the Initial Graph / Current Graph distinction and which is in use

### 4.2 From EV-007 Crowd

* current crowd groups and their states
* `occupancy` (people)
* `flow` (people/minute)
* `inflow` and `throughput` (people/minute)
* `queue_size` (people)
* `waiting_time` (seconds)
* `travel_time` (seconds)
* `utilization` (dimensionless)
* `density` and `density_state` (dimensionless / enum)
* `overload` (boolean or null)
* `arrival_rate` (people/minute)

### 4.3 From EV-008 Disruption

* active disruptions
* affected nodes and edges
* severity (contextual metadata only — see §5)
* lifecycle status
* `start_time`
* `expected_duration` (seconds, operational metadata)
* applied operational effects and the resulting operational context

### 4.4 Historical and Event Data

* prior event data
* historical flow
* historical queue behaviour
* historical disruption context

Historical inputs are used as model context or as features. They are never treated as current state.

### 4.5 Non-Mutation Rule

EV-009 reads these inputs and writes nothing back. It does not write graph status, crowd metrics, disruption lifecycle, or operational parameters. A prediction is an output object only.

### 4.6 Scenario Input Mode (EV-011)

EV-009 runs in one of two input modes. The mode is determined by the caller and is never inferred.

| Mode | Caller | Input state | Clock |
| --- | --- | --- | --- |
| **Live** | The operational system | Live EV-006 Current Graph, live EV-007 crowd state, live EV-008 disruption registry | Wall clock |
| **Scenario** | EV-011 | Scenario graph copy, scenario crowd state, scenario disruption registry, scenario operational parameters | The **scenario clock** |

Rules for scenario mode:

* EV-009 is given the scenario state **explicitly and in full**. It must not implicitly read live operational state — not the live graph, not live crowd state, not the live disruption registry.
* The scenario state uses the same schema as live state (§4.1–§4.3). There is no scenario-specific prediction input format, and there is no second prediction system.
* `prediction_time` and `expected_time` use the scenario clock wherever simulation time is relevant, so a scenario forecast is directly comparable with the scenario's own metrics.
* Scenario predictions are scenario-scoped. They never overwrite or enter live prediction history, and they never modify live state (§4.5).
* Scenario predictions may be used inside the simulation as context. They are never promoted to live predictions automatically; promotion requires an explicit separate system action outside EV-011.
* Failure behaves as EV-011 §13 defines. A `NO_PREDICTION` result does not fail the simulation unless the scenario sets `require_prediction = true`.

EV-009 performs the same forecasting work in both modes. The mode selects **which state the forecast is about**; it does not change the output schema (§6), the confidence semantics (§7) or the methods (§8).

---

## 5. Disruption and Severity Boundary

EV-009 may use disruption information as **context**.

It MAY:

* use disruption presence, affected entities and lifecycle as categorical context
* use `expected_duration` as operational metadata describing how long a condition is expected to last
* use applied operational effects to understand the current operational configuration

It MUST NOT:

* convert `HIGH` severity into a numeric crowd multiplier
* convert `CRITICAL` severity into a probability
* treat severity as physical impact
* bypass actual graph or crowd state to make a prediction

Prediction values must be based on **operational state and model features**, not on the severity label.

| Input | Role in prediction |
| --- | --- |
| Crowd state (EV-007) | Primary state input |
| Graph configuration and status (EV-006) | Structural input |
| Disruption affected entities and lifecycle (EV-008) | Categorical context |
| Disruption `severity` (EV-008) | Contextual categorical metadata only |
| Disruption `expected_duration` (EV-008) | Operational expectation metadata |

`expected_duration` is **not** a prediction and is not produced by EV-009. If EV-009 produces a predicted recovery or clearance time, that is a distinct EV-009 value and it does not modify the disruption record.

---

## 6. Prediction Output Contract

### 6.1 Schema

| Field | Type | Required | Unit | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Required | — | Stable prediction identifier, `PRED_<NUMBER>` |
| `request_id` | string | Required | — | The request this prediction answers |
| `target_type` | enum | Required | — | `NODE`, `EDGE`, `EVENT` |
| `target_id` | string \| null | Required | — | Entity id; `null` only for `EVENT` |
| `metric` | enum | Required | — | One of the six metrics in §3.2 |
| `prediction_time` | timestamp | Required | ISO-8601 UTC | When the prediction was produced |
| `expected_time` | timestamp | Required | ISO-8601 UTC | The future moment predicted; equals `prediction_time + horizon` |
| `horizon` | integer | Required | **seconds** | Distance into the future |
| `predicted_value` | number \| string \| null | Required | unit of `metric` | The predicted value; `null` when `status = NO_PREDICTION` |
| `unit` | string | Required | — | Unit of `predicted_value` (see §6.3) |
| `confidence` | integer | Required | **percentage [0, 100]** | Model confidence that the prediction is useful (§7) |
| `explanation` | string | Required | — | Human-readable explanation (§11) |
| `status` | enum | Required | — | `OK`, `LOW_CONFIDENCE`, `STALE`, `NO_PREDICTION` |
| `reason` | enum \| null | Required | — | Machine-readable reason; `null` when `status = OK` |
| `method` | string | Required | — | Identifier of the method that produced the value (§8) |

### 6.2 Status Values

| `status` | Meaning | `predicted_value` |
| --- | --- | --- |
| `OK` | A usable prediction was produced and is current | present |
| `LOW_CONFIDENCE` | A prediction was produced but its confidence is below the usable threshold | present |
| `STALE` | A previously valid prediction whose input context changed materially or which aged past `max_prediction_age` | present but not to be treated as current |
| `NO_PREDICTION` | No prediction could be produced | `null` |

`status` is the single field a consumer must check before using `predicted_value`.

### 6.3 Canonical Units

Units are fixed per metric and are never inferred by the consumer.

| `metric` | `unit` value | Example |
| --- | --- | --- |
| `flow` | `people/minute` | `185.0` |
| `waiting_time` | `seconds` | `420` |
| `travel_time` | `seconds` | `128` |
| `congestion` | `dimensionless` | `0.31` |
| `queue_size` | `people` | `250` |
| `availability` | `enum` | `"UNAVAILABLE"` |

No other unit is valid for a metric. A prediction whose unit does not match §6.3 is invalid and is rejected at validation.

### 6.4 Example

```json
{
  "id": "PRED_0007",
  "request_id": "PRED_REQ_0001",
  "target_type": "NODE",
  "target_id": "CHECKPOINT_01",
  "metric": "waiting_time",
  "prediction_time": "2026-09-19T19:01:00Z",
  "expected_time": "2026-09-19T19:06:00Z",
  "horizon": 300,
  "predicted_value": 100,
  "unit": "seconds",
  "confidence": 60,
  "explanation": "Contributing factors: queue of 400 people at CHECKPOINT_01, service rate limited to 60 people/minute, no inflow because GATE_01 is closed. Projected by linear extrapolation of currently observed rates.",
  "status": "OK",
  "reason": null,
  "method": "deterministic_queue_v1"
}
```

---

## 7. Confidence

### 7.1 Definition

**`confidence` is the model's confidence that the prediction is useful and reliable.**

It is a percentage in `[0, 100]`.

Confidence is **not**:

* the probability that an event occurs
* disruption severity
* crowd density
* a measure of the importance of the target

### 7.2 Behavior

| Band | Condition | Behavior |
| --- | --- | --- |
| High | `confidence ≥ confidence_high_threshold` | Prediction is usable; `status = OK` |
| Usable | `confidence_usable_threshold ≤ confidence < confidence_high_threshold` | Prediction is usable; `status = OK` |
| Low | `0 ≤ confidence < confidence_usable_threshold` | `status = LOW_CONFIDENCE`; value is present but consumers apply their own policy before using it |
| Invalid | No value could be produced | `status = NO_PREDICTION`; `predicted_value = null`; `reason` set |

Thresholds are configuration. Defaults: `confidence_high_threshold = 75`, `confidence_usable_threshold = 50`.

### 7.3 Where Confidence Comes From

* An ML or statistical model reports its own confidence, expressed as a percentage.
* The deterministic fallback reports `fallback_confidence` (configuration, default `60`), because a rule-based projection is usable but not high-confidence.

EV-009 does not derive confidence from severity, density or any other domain's value.

---

## 8. Prediction Methods

### 8.1 Model-Agnostic Interface

EV-009 defines the interface, not the model.

```text
PredictionModel
    predict(PredictionRequest, PredictionContext) -> PredictionValue | Failure
```

| Element | Definition |
| --- | --- |
| `PredictionRequest` | §3.4 |
| `PredictionContext` | the inputs in §4, assembled by the EV-009 input adapter |
| `PredictionValue` | `{ predicted_value, unit, confidence, explanation, method }` |
| `Failure` | a reason code from §12 |

Any implementation satisfying the interface is a valid model: an ML model, a statistical model, or the deterministic fallback.

### 8.2 Primary Method — ML / Statistical Forecasting

Where a trained model is available, it is the primary method. It receives the assembled context and returns a `PredictionValue` with its own confidence and explanation.

No particular model type, library or training pipeline is mandated. The interface is what EV-009 owns.

### 8.3 Deterministic Fallback — Required

**The system must function without any ML model.** A deterministic, rule-based fallback is therefore required and always available.

Fallback constraints:

* it uses only current realized EV-007 values and current EV-006 configuration
* it is a **linear projection of currently observed rates with no feedback, no state evolution, and no configuration change**
* it does not advance crowd state, does not execute a scenario, and produces no timeline
* it therefore cannot be a simulation, and it does not duplicate EV-011

The fallback supports horizons up to `fallback_max_horizon` (configuration, default `900` seconds). A longer horizon produces `NO_PREDICTION` with reason `HORIZON_OUT_OF_RANGE`.

### 8.4 Fallback Rules Per Metric

All quantities below are current EV-007 realized values. `h` is the horizon in seconds.

| `metric` | Deterministic fallback rule |
| --- | --- |
| `flow` | Persist the current realized rate: `edge.flow` for an edge, `node.throughput` for a node. Unit people/minute. |
| `queue_size` | `max(0, queue_size + (inflow − throughput) × h / 60)`, using the node's current `inflow` and `throughput` (people/minute). Unit people. |
| `waiting_time` | Apply the EV-007 `queue_wait` relationship (EV-007 §14.1) to the projected queue: `60 × predicted_queue / throughput_capacity`. Unit seconds. `null` when `throughput_capacity` is not positive. |
| `travel_time` | Persist the current realized travel time for the target edge. Unit seconds. `NO_PREDICTION` if no realized value exists. |
| `congestion` | Persist the current `density` load ratio. Unit dimensionless. |
| `availability` | `UNAVAILABLE` if the target's current `status` is `CLOSED`, otherwise `AVAILABLE`. Overload alone does **not** make an entity unavailable, consistent with EV-007 §12.5. |

The fallback explanation must name the rule used and the observed inputs it extrapolated from.

---

## 9. Refresh, Invalidation and Staleness

### 9.1 Event-Triggered Refresh

A refresh is triggered by any material input change, including:

* a graph `status` change on the target or on an entity on its route
* an applied operational effect from a disruption
* a disruption lifecycle transition affecting the target
* a crowd threshold event on the target (`overload`, `high_density`, `queue_increasing`, `queue_stalled`, `movement_slowing`)
* a crowd state change that materially alters the target's `occupancy`, `flow`, `queue_size` or `throughput`

### 9.2 Periodic Refresh

A periodic refresh runs every `refresh_interval` seconds (configuration, default `60`). Event-triggered refresh takes precedence over the periodic cycle.

### 9.3 Invalidation and Staleness

A prediction becomes invalid when its valid context no longer holds. EV-009 sets `status = STALE` when either applies:

| Condition | Threshold |
| --- | --- |
| Age-based | `now − prediction_time > max_prediction_age` (configuration, default `120` seconds) |
| Context-based | A material input change (§9.1) occurred after `prediction_time` for the target, beyond `stale_context_tolerance` (configuration) |

Rules:

* A stale prediction keeps its `predicted_value` for traceability but must not be treated as current.
* **Stale predictions must not silently feed optimization.** Consumers must check `status` (§13.3), and EV-009 never upgrades a stale prediction back to `OK` — a new prediction is produced instead.

---

## 10. Prediction History and Feedback

| Aspect | MVP behavior |
| --- | --- |
| Default persistence | **Runtime-only.** Predictions live for the current session and are not persisted by default. |
| Supersession | A newer prediction for the same `(target_type, target_id, metric)` supersedes the older one. The older one becomes `STALE`. |
| Optional persistence | Persistence may be enabled for reporting. It does not change prediction semantics. |
| Use of previous predictions as features | **Disabled by default.** Enabled only when `allow_prediction_history_features = true`, and only per request via `allow_history`. |
| Recursive chaining | **Never mandatory.** A prediction may depend on a previous prediction only when history features are explicitly enabled. Default behavior contains no recursive dependency. |

This prevents recursive prediction feedback loops from being a required part of the architecture.

---

## 11. Explanation

Every successful prediction must carry a human-readable `explanation` that identifies:

* the main contributing factors
* the affected entity
* the relevant crowd condition
* the relevant disruption or operational context, where applicable
* the method that produced the value

Rules:

* Explanations state **contributing factors**, not proven causes.
* When the method is statistical or ML-based, the explanation must use associational language and must not assert causal certainty.
* When the method is the deterministic fallback, the explanation may state the rule and its inputs plainly, because the relationship is definitional.
* An explanation must never present disruption severity as the cause of the predicted value.

Example:

```text
"Contributing factors: queue of 400 people at CHECKPOINT_01, service rate
limited to 60 people/minute, no inflow because GATE_01 is closed.
Projected by linear extrapolation of currently observed rates."
```

---

## 12. Failure Handling

When a prediction cannot be produced, EV-009 returns a prediction object with `status = NO_PREDICTION`, `predicted_value = null`, `explanation` describing the failure, and a machine-readable `reason`.

| `reason` | Meaning |
| --- | --- |
| `INSUFFICIENT_STATE` | Required crowd or graph state is missing or not yet initialized |
| `UNKNOWN_TARGET` | `target_id` does not resolve in the current graph |
| `METRIC_NOT_SUPPORTED` | `metric` is outside the closed enum in §3.2 |
| `HORIZON_OUT_OF_RANGE` | `horizon` is outside `[min_horizon, max_horizon]`, or beyond `fallback_max_horizon` for the fallback |
| `MODEL_UNAVAILABLE` | The primary model is unavailable and the fallback is disabled by configuration |
| `FALLBACK_FAILED` | The deterministic fallback could not produce a value (for example no realized travel time exists) |
| `STALE_INPUT` | The supplied input state is older than the allowed input age |
| `INVALID_REQUEST` | The request is malformed or violates the schema in §3.4 |

Rules:

* Failure is **never silent**. A missing value is always represented explicitly as `NO_PREDICTION` with a reason.
* A failed prediction does not mutate any input.
* A failed prediction for one target does not block predictions for other targets.
* Downstream behavior on failure: **EV-010 may continue** without that prediction, subject to its own policy (§13.3). Prediction failure is not, by itself, a reason to halt optimization.

---

## 13. Prediction → Optimization Contract

### 13.1 What EV-010 Receives

For each prediction, EV-010 receives the complete object in §6.1, specifically:

| Received | Use in EV-010 |
| --- | --- |
| `id` | Traceability from a ranked strategy back to the prediction |
| `request_id` | Correlation with the originating request |
| `target_type`, `target_id` | Linking the prediction to the strategies that affect that entity |
| `metric` | Which objective or constraint input the value maps to |
| `expected_time` | Which point in the future the value refers to |
| `horizon` | Horizon context for strategy selection |
| `predicted_value` and `unit` | The value used, in a fixed unit |
| `confidence` | Consumer policy input, not an objective term by default |
| `explanation` | Explainability surfaced to the operator |
| `status`, `reason` | Validity check before use |
| `method` | Method transparency |

### 13.2 What EV-009 Does Not Do

* EV-009 does **not** rank interventions.
* EV-009 does **not** generate or select strategies.
* EV-009 does **not** apply anything.
* In MVP, EV-009 does **not** publish a risk ranking. Ranking predicted conditions against each other is a consumer concern and must never be confused with strategy ranking, which belongs to EV-010.

### 13.3 Consumer Policy

EV-010 must be able to ignore stale and low-confidence predictions according to an explicit, configured policy — never implicitly.

| Policy key | Effect |
| --- | --- |
| `min_prediction_confidence` | Predictions below this confidence are excluded from consideration |
| `max_prediction_age` | Predictions older than this are excluded |
| `allow_predicted_risk_term` | Whether predicted risk contributes to the optimization objective at all (default `false`) |

A prediction with `status = STALE` or `NO_PREDICTION` is never used as a current-state value. A forecast is never treated as current state.

---

## 14. Domain Boundary

| Concern | Owner |
| --- | --- |
| Graph topology, configuration, authoritative status | EV-006 |
| Crowd state, crowd metrics, crowd consequences | EV-007 |
| Disruption identity, type, affected entities, severity, lifecycle, timing, operational effects | EV-008 |
| **Future forecasts, prediction confidence, prediction staleness, prediction explanation** | **EV-009** |
| Strategy generation, feasibility, constraints, objectives, ranking | EV-010 |
| Scenario execution, simulation time, simulation results | EV-011 |
| Authorization and application of live changes | Operational layer |

EV-009 owns prediction only. It writes nothing to any other domain and duplicates no other domain's metric definitions — predictions reference EV-006 and EV-007 quantities by name and unit rather than redefining them.

---

## 15. MVP Requirements

| Requirement | MVP behavior |
| --- | --- |
| Question answered | "What is likely to happen next?" only |
| Targets | Closed enum of six metrics over `NODE` / `EDGE` / `EVENT` |
| Horizon | Configurable per request, in seconds, with configured min and max |
| Repeated updates | Supported; newer predictions supersede older ones |
| Input contract | Explicit, read-only, sourced from EV-006, EV-007, EV-008 and historical data |
| Severity | Contextual categorical metadata only; never converted to a numeric value |
| Output schema | Single schema with fixed fields and fixed units per metric |
| Units | `people/minute`, `seconds`, `people`, `dimensionless`, enum — matching EV-006 and EV-007 |
| Confidence | Percentage `[0, 100]`, with defined high / usable / low / invalid behavior |
| Methods | Model-agnostic interface; ML optional; deterministic fallback required |
| Refresh | Event-triggered plus configurable periodic refresh |
| Staleness | Age-based and context-based invalidation; stale predictions never silently used |
| History | Runtime-only by default; history features opt-in; no mandatory recursion |
| Explanation | Required on every successful prediction; no causal overclaiming |
| Failure | `NO_PREDICTION` with a machine-readable reason; never silent |
| Non-mutation | EV-009 writes nothing to any other domain |

---

## 16. Example

Continuing the scenario from EV-006 §18, EV-007 §27 and EV-008 §27.

### 16.1 Context

```text
DISRUPTION_001  GATE_CLOSURE        GATE_01        status OPEN → CLOSED        APPLIED
DISRUPTION_002  CHECKPOINT_FAILURE  CHECKPOINT_01  throughput_capacity
                                                   120 → 60 people/minute      APPLIED

EV-006 Current Graph configuration
    CHECKPOINT_01   capacity 400 people, throughput_capacity 60 people/minute
    EDGE_05         unusable (its endpoint GATE_01 is CLOSED)

EV-007 state at 19:01:00
    CHECKPOINT_01   occupancy 400 people, queue_size 400 people
    node.inflow(CHECKPOINT_01)     = 0 people/minute
    node.throughput(CHECKPOINT_01) = 60 people/minute
```

### 16.2 Requests

```json
[
  { "request_id": "PRED_REQ_0001", "target_type": "NODE", "target_id": "CHECKPOINT_01",
    "metric": "queue_size",    "horizon": 300, "requested_at": "2026-09-19T19:01:00Z" },
  { "request_id": "PRED_REQ_0002", "target_type": "NODE", "target_id": "CHECKPOINT_01",
    "metric": "waiting_time",  "horizon": 300, "requested_at": "2026-09-19T19:01:00Z" },
  { "request_id": "PRED_REQ_0003", "target_type": "NODE", "target_id": "CHECKPOINT_01",
    "metric": "congestion",    "horizon": 300, "requested_at": "2026-09-19T19:01:00Z" },
  { "request_id": "PRED_REQ_0004", "target_type": "NODE", "target_id": "GATE_01",
    "metric": "availability",  "horizon": 300, "requested_at": "2026-09-19T19:01:00Z" }
]
```

### 16.3 Deterministic Fallback Evaluation

No ML model is available in this example, so the deterministic fallback is used with `fallback_confidence = 60`.

```text
queue_size(19:06:00)
    = max(0, queue_size + (inflow − throughput) × h / 60)
    = max(0,  400 + (0 − 60) × 300 / 60)
    = max(0,  400 − 300)
    = 100 people

waiting_time(19:06:00)
    = 60 × predicted_queue / throughput_capacity
    = 60 × 100 / 60
    = 100 seconds

congestion(19:06:00)
    predicted occupancy = 100 people, capacity = 400 people
    = 100 / 400
    = 0.25 dimensionless  → density_state LOW

availability(GATE_01)
    current status = CLOSED  →  UNAVAILABLE
```

### 16.4 Output

```json
[
  {
    "id": "PRED_0007", "request_id": "PRED_REQ_0001",
    "target_type": "NODE", "target_id": "CHECKPOINT_01", "metric": "queue_size",
    "prediction_time": "2026-09-19T19:01:00Z", "expected_time": "2026-09-19T19:06:00Z",
    "horizon": 300, "predicted_value": 100, "unit": "people", "confidence": 60,
    "explanation": "Contributing factors: queue of 400 people at CHECKPOINT_01 and a service rate of 60 people/minute with no inflow, because GATE_01 is CLOSED. Projected by linear extrapolation of currently observed rates.",
    "status": "OK", "reason": null, "method": "deterministic_queue_v1"
  },
  {
    "id": "PRED_0008", "request_id": "PRED_REQ_0002",
    "target_type": "NODE", "target_id": "CHECKPOINT_01", "metric": "waiting_time",
    "prediction_time": "2026-09-19T19:01:00Z", "expected_time": "2026-09-19T19:06:00Z",
    "horizon": 300, "predicted_value": 100, "unit": "seconds", "confidence": 60,
    "explanation": "Contributing factors: predicted queue of 100 people at CHECKPOINT_01 served at 60 people/minute, using the EV-007 queue-wait relationship.",
    "status": "OK", "reason": null, "method": "deterministic_queue_v1"
  },
  {
    "id": "PRED_0009", "request_id": "PRED_REQ_0003",
    "target_type": "NODE", "target_id": "CHECKPOINT_01", "metric": "congestion",
    "prediction_time": "2026-09-19T19:01:00Z", "expected_time": "2026-09-19T19:06:00Z",
    "horizon": 300, "predicted_value": 0.25, "unit": "dimensionless", "confidence": 60,
    "explanation": "Contributing factors: predicted occupancy of 100 people against a holding capacity of 400 people at CHECKPOINT_01.",
    "status": "OK", "reason": null, "method": "deterministic_queue_v1"
  },
  {
    "id": "PRED_0010", "request_id": "PRED_REQ_0004",
    "target_type": "NODE", "target_id": "GATE_01", "metric": "availability",
    "prediction_time": "2026-09-19T19:01:00Z", "expected_time": "2026-09-19T19:06:00Z",
    "horizon": 300, "predicted_value": "UNAVAILABLE", "unit": "enum", "confidence": 60,
    "explanation": "Contributing factors: current graph status of GATE_01 is CLOSED following the applied operational effect of DISRUPTION_001. Deterministic availability rule.",
    "status": "OK", "reason": null, "method": "deterministic_availability_v1"
  }
]
```

### 16.5 What the Predictions Imply

The four forecasts describe a venue whose checkpoint queue is draining while the venue interior is not. `CHECKPOINT_01` has no inflow (`EDGE_05` is unusable) and a disruption-locked service rate, so its queue falls from `400` at a constant `60` people/minute and reaches `0` before the simulation window closes. That trajectory is fixed by the disruption lock and no candidate strategy can alter it — which is exactly why the EV-010 §18.4 comparison reports an identical `peak_queue` of `400` for every candidate, and why the EV-011 §23.2 metrics show `peak_queue` and `queue_size` unvarying. The prediction and the sandbox agree, and they agree for a stated reason.

The predictions therefore tell an operator something genuinely useful: relieving `CHECKPOINT_01` is **not** the lever. The lever is egress through `EXIT_01`, which `PRED_0010` correctly reports as reachable-but-closed context. Directing attention to `EXIT_01` rather than to the visibly draining checkpoint queue is the main operational value of this prediction set.

### 16.6 How EV-010 Uses This

* `PRED_0007` and `PRED_0008` supply objective inputs for minimizing queue and waiting time at `CHECKPOINT_01`.
* `PRED_0009` supplies a congestion objective input.
* `PRED_0010` marks `GATE_01` `UNAVAILABLE`, so any candidate strategy that depends on `GATE_01` being open is treated as infeasible while the disruption is active.
* Because all three checkpoint predictions rest only on inputs that candidate strategies cannot change, they remain valid across every scenario in the EV-011 comparison. Applying `STRATEGY_03` opens `EXIT_01` and does not materially alter `CHECKPOINT_01`'s `occupancy`, `flow`, `queue_size` or `throughput`, so §9's invalidation rule does not fire against the target.
* All four carry `confidence = 60` and `status = OK`, so they pass a policy such as `min_prediction_confidence = 50`.

**Boundary check:** EV-009 produced forecasts, changed nothing, ranked nothing, and interpreted no severity.

---

## 17. Architectural Summary

EV-009 is the forecasting layer. It converts current state, historical context and disruption context into explicit, unit-carrying predictions of what is likely to happen next, and it does nothing else.

Key invariants:

* EV-009 answers "what is likely to happen next?" and never "what should we do?".
* Prediction targets are a closed set of six metrics over nodes, edges and whole-event scope.
* The horizon is configurable in seconds and is always explicit on every prediction.
* `expected_time = prediction_time + horizon` always holds.
* Units are fixed per metric: `people/minute`, `seconds`, `people`, `dimensionless`, or enum.
* `confidence` is a percentage describing model reliability. It is never probability, severity or density.
* Disruption severity is contextual categorical metadata and is never converted into a numeric prediction input.
* `expected_duration` is operational metadata, not a prediction, and EV-009 never rewrites it.
* A deterministic fallback is always available, so the system functions without ML. The fallback is a linear projection of current rates and is not a simulation.
* Staleness is explicit and enforced: stale or low-confidence predictions never silently reach optimization.
* Prediction history is runtime-only by default, and recursive prediction chaining is never mandatory.
* Every successful prediction carries a human-readable explanation that states contributing factors without claiming causal certainty.
* Failure is always explicit: `NO_PREDICTION` plus a machine-readable reason.
* EV-009 writes nothing to the graph, the crowd, the disruption registry or any other domain.
