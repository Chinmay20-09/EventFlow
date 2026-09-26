# EV-010 — Optimization Model

**Document ID:** EV-010
**Domain:** Optimization
**Status:** MVP Specification
**Depends On:** EV-006 Graph Model, EV-007 Crowd Model, EV-008 Disruption Model, EV-009 Prediction
**Consumed By:** EV-011 Simulation, Operator UI / operational layer

**Purpose:** Define candidate strategy generation, feasibility, objectives, constraints, ranking and the approval handoff for EventFlow.

---

## 1. Purpose

The Optimization Model is the strategic decision layer of EventFlow.

It answers exactly one question: **"What could we change, and what would happen if we changed it?"**

It receives current event state, predicted future conditions, disruptions and constraints, then generates multiple feasible intervention strategies and ranks them.

Optimization does **not** directly change live operations. It produces and ranks strategies. The operator retains final approval, and the operational layer applies the authorized change.

---

## 2. Scope

### 2.1 In Scope

* candidate intervention strategy generation
* decision variables and their domains
* hard constraints and feasibility validation
* objective definition
* simulation coupling
* deterministic ranking
* strategy comparison
* approval handoff to the operator
* structured failure results

### 2.2 Out of Scope

| Concern | Owner |
| --- | --- |
| Graph topology, configuration, authoritative status | EV-006 |
| Applying live graph changes | Operational layer |
| Crowd state and crowd metrics | EV-007 |
| Disruption identity, lifecycle, declared operational effects | EV-008 |
| Forecasting | EV-009 |
| Scenario execution and simulation time | EV-011 |
| Approval decision | Operator |

**Optimization never writes graph state.** It proposes; the operational layer disposes.

---

## 3. Architecture — The Optimization Loop

This loop is the core of EventFlow and is preserved exactly.

```text
      Graph
        +
      Crowd
        +
   Disruptions
        +
   Predictions
        │
        ▼
   Optimization ──► Candidate Strategies
        ▲                 │
        │                 ▼
        │            Simulation
        │                 │
        │                 ▼
        │          Strategy Outcomes
        │                 │
        └─────────────────┘
        │
        ▼
  Ranked Strategies
        │
        ▼
  Operator Choice
        │
        ▼
 Operational Layer
        │
        ▼
 Authorized Graph Change
        │
        ▼
 EV-006 Current Graph  ──►  EV-007 Crowd reacts
```

The `Optimization → Simulation → Optimization` cycle is intentional and repeatable. It is not a circular dependency; it is the evaluation loop by which candidates are scored.

---

## 4. Inputs

Optimization may consume the following. All units are the canonical units of the owning document.

### 4.1 Graph (EV-006)

* nodes and directed edges
* node and edge `status` (`OPEN` / `CLOSED`)
* node `capacity` (**people**, holding)
* node `throughput_capacity` (**people/minute**, service rate)
* edge `capacity` (**people/minute**, flow capacity)
* edge `distance` (metres), `baseline_time` and `current_time` (seconds)
* `active_entries`, `active_exits`
* operational parameters
* the Current Graph as the authoritative operational configuration
* `status_source` provenance per changed entity

### 4.2 Crowd (EV-007)

* crowd groups and states
* `occupancy` (people)
* `flow` (people/minute)
* `queue_size` (people)
* `waiting_time` (seconds)
* `travel_time` (seconds)
* `throughput` and `arrival_rate` (people/minute)
* `utilization` (dimensionless)
* `overload` (boolean or null)
* `density` (dimensionless load ratio)

These remain EV-007 metrics. EV-010 consumes them and never recomputes them.

### 4.3 Disruptions (EV-008)

* active disruptions and their lifecycle
* affected nodes and edges
* applied operational effects and the resulting authoritative values
* declared but unapplied effects (`effect_status = PROPOSED`)

Disruptions are treated as **context, constraints, unavailable resources and current operational conditions**. EV-010 never modifies a disruption or its lifecycle.

Severity is contextual metadata. It never becomes a numeric objective term, constraint value or ranking weight.

### 4.4 Predictions (EV-009)

* prediction id, target, metric, `expected_time`, `horizon`
* `predicted_value` and `unit`
* `confidence`
* `explanation`
* `status` and `reason`

Only predictions with `status = OK` are eligible by default. `LOW_CONFIDENCE`, `STALE` and `NO_PREDICTION` are excluded unless configuration explicitly permits otherwise (§12.4).

### 4.5 Configurable Constraints and Parameters

Configuration supplies:

* the controllable entity sets (§5.1)
* capacity and throughput bounds
* `max_status_changes`
* reachability policy
* excluded entities
* objective weights
* simulation parameters (baseline, duration, seed)
* prediction policy (§12.4)

Constraints are configuration, never hardcoded.

---

## 5. Decision Variables

Decision variables are the only things Optimization may decide. Each has a bounded domain, an owning entity type, a unit, and a configuration gate that must be enabled for the variable to exist at all.

| Variable | Domain | Applies to | Unit | Available when |
| --- | --- | --- | --- | --- |
| `x_status[n]` | `{0, 1}` — `1` = `OPEN`, `0` = `CLOSED` | `n ∈ controllable_nodes` (EV-006 node ids) | — | node is in `controllable_nodes`, not disruption-locked, not operator-locked |
| `x_status[e]` | `{0, 1}` — `1` = `OPEN`, `0` = `CLOSED` | `e ∈ controllable_edges` (EV-006 edge ids) | — | edge is in `controllable_edges`, not disruption-locked, not operator-locked |
| `v_capacity[n]` | integer in `[min_node_capacity[n], capacity[n]]` | `n` where allowed | **people** (holding) | `allow_node_capacity_change = true` |
| `v_capacity[e]` | real in `[min_edge_capacity[e], capacity[e]]` | `e` where allowed | **people/minute** (flow) | `allow_edge_capacity_change = true` |
| `v_throughput[n]` | real in `[min_throughput[n], throughput_capacity[n]]` | `n` where allowed | **people/minute** (service) | `allow_throughput_change = true` |
| `d_share[g]` | real in `[0, 1]`, `Σ d_share[g] = 1` | `g ∈ active_entries` | fraction (dimensionless) | `allow_demand_rebalancing = true` |

### 5.1 Controllable Entity Sets

```text
controllable_nodes  ⊂ graph.nodes
controllable_edges  ⊂ graph.edges
```

Both are configuration. Default: `controllable_nodes` contains `GATE`, `ENTRANCE`, `EXIT` and `CHECKPOINT` nodes; `controllable_edges` is empty until explicitly configured.

An entity is **disruption-locked** when an applied operational effect from an active disruption targets it. Disruption-locked entities are removed from the controllable set, so no candidate can reopen or relax a change that a disruption applied. This is enforced as constraint C1 (§8).

An entity is **operator-locked** when its `status_source` is `OPERATOR` and `lock_operator_changes = true`.

### 5.2 What Optimization May Not Decide

* it may not add, remove or reconnect nodes or edges
* it may not change edge `distance`, `baseline_time`, `current_time`, or direction
* it may not change node `latitude` / `longitude`, `label` or `type`
* it may not modify disruptions, disruption lifecycle or severity
* it may not remove a `restriction` applied by an active disruption
* it may not change ground-truth constants of the crowd model (speeds, thresholds)

**`restriction` is not a decision variable.** It appears in no domain in §5 and is never a degree of freedom. Restrictions are read as fixed constraints (C7, §8). The three roles are distinct and must not be conflated:

| Role | Owner | Meaning |
| --- | --- | --- |
| **Declared** | EV-008 | A disruption states that a restriction applies, as an operational effect with `parameter = restriction` (EV-008 §10.2) |
| **Applied** | Operational layer → EV-006 Current Graph | The operational layer applies the effect; the Current Graph holds the resulting authoritative restriction set (EV-006 §7.5) |
| **Consumed** | EV-010 | The active restriction is read as a fixed constraint on any candidate strategy, never as something to optimize |

Optimization receives the applied state and treats it as given. It cannot create, relax or remove a restriction that an active disruption applied (C7).

Allowing only the variables in §5 prevents arbitrary graph mutation.

---

## 6. Strategy Model

### 6.1 Strategy Schema

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | Required | Stable strategy identifier, `STRATEGY_<NUMBER>` |
| `parameter_changes` | `ParameterChange[]` | Required | The changes this strategy proposes |
| `affected_nodes` | string[] | Required | Derived: EV-006 nodes affected by the changes |
| `affected_edges` | string[] | Required | Derived: EV-006 edges affected by the changes |
| `affected_crowd_groups` | string[] | Optional | EV-007 group ids materially affected, where determinable |
| `expected_outcome` | object \| null | Required | Populated from the simulation outcome (§6.3); `null` before evaluation |

### 6.2 Parameter Change Schema

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `parameter` | enum | Required | `status`, `capacity`, `throughput_capacity` (EV-006 / EV-008 parameter names), or `demand_share` (§6.2.1) |
| `target_type` | enum | Required | `NODE` or `EDGE` |
| `target_id` | string | Required | EV-006 node or edge id |
| `previous_value` | any | Required | Authoritative value at strategy generation time, observed **in the state in which the change is evaluated** — the live Current Graph for a live strategy, or the scenario copy when the same strategy is evaluated inside EV-011 (§7.2, EV-011 §7) |
| `proposed_value` | any | Required | The value this strategy proposes |

Units are unambiguous and follow the target type, exactly as in EV-006 §10.3:

| `parameter` | `target_type` | Unit | Allowed values |
| --- | --- | --- | --- |
| `status` | `NODE` | — | `OPEN`, `CLOSED` |
| `status` | `EDGE` | — | `OPEN`, `CLOSED` |
| `capacity` | `NODE` | **people** | integer ≥ 0 |
| `capacity` | `EDGE` | **people/minute** | number ≥ 0 |
| `throughput_capacity` | `NODE` | **people/minute** | number ≥ 0 |
| `throughput_capacity` | `EDGE` | — | **invalid** |
| `demand_share` | `NODE` | — (dimensionless fraction) | real in `[0, 1]`; the set over `active_entries` sums to `1` |
| `demand_share` | `EDGE` | — | **invalid** |

### 6.2.1 Demand Share and Its Execution Path

`demand_share` is the only parameter that changes **demand distribution** rather than graph configuration. It expresses the proportion of generated demand assigned to each configured active entry source. It never changes topology, capacity or availability.

| Field | Value |
| --- | --- |
| `parameter` | `demand_share` |
| `target_type` | `NODE` |
| `target_id` | An EV-006 node id present in `active_entries` |
| `previous_value` | The entry's current share, or `null` when no explicit distribution is configured (equal shares are the default) |
| `proposed_value` | Real in `[0, 1]` |

Rules:

* Shares are non-negative, and the complete set over `active_entries` sums to `1` (C4, §8).
* A strategy that rebalances demand must carry an entry for **every** active entry, not only the entries it changes. A partial set is rejected with `DEMAND_SHARE_INVALID` (§7.1).
* Demand-share changes are **not** graph topology changes and are **not** graph overrides. They are demand configuration.
* When `allow_demand_rebalancing = false`, no `d_share[g]` variable is created and no `demand_share` parameter may appear in any candidate.
* Active entries come from EV-006. Rebalancing redistributes demand **among** the configured active entries; it never activates a new entry.

Execution path:

```text
EV-010  d_share[g]                          decision variable (§5)
            │
            ▼
        ParameterChange { demand_share, NODE, <active entry>, proposed_value }
            │
            ▼
EV-011  scenario.interventions[]            carried as an intervention, not a graph override
            │
            ▼
        scenario demand configuration       per-entry shares for the run
            │
            ▼
EV-007  entrance-generated demand           generates arrival batches per entry
        (§18.2 source 2)                    using the supplied shares
```

EV-007 remains the owner of crowd generation and propagation. EV-011 supplies the scenario demand configuration and must not duplicate or re-derive any EV-007 crowd formula.

### 6.3 Expected Outcome

Populated after simulation evaluation. All values come from the EV-011 `SimulationResult` metric set; EV-010 does not compute them.

| Field | Unit |
| --- | --- |
| `expected_congestion` | dimensionless (peak, scoped to affected entities) |
| `expected_queue_size` | **people** (peak, scoped to affected entities) |
| `expected_waiting_time` | **seconds** (mean over the run) |
| `expected_travel_time` | **seconds** (mean over the run) |
| `expected_throughput` | **people/minute** (arrival rate over the run) |
| `simulation_result_id` | — (reference to the EV-011 result) |

### 6.4 Strategy Example

```json
{
  "id": "STRATEGY_02",
  "parameter_changes": [
    { "parameter": "status", "target_type": "NODE", "target_id": "EXIT_01",
      "previous_value": "CLOSED", "proposed_value": "OPEN" }
  ],
  "affected_nodes": ["EXIT_01"],
  "affected_edges": ["EDGE_07"],
  "affected_crowd_groups": ["CG_01", "CG_02"],
  "expected_outcome": null
}
```

---

## 7. Feasibility

A candidate is **feasible** only when every hard constraint in §8 is satisfied.

* Validation is performed before any simulation is requested.
* Infeasible candidates are **discarded from ranking**. They never enter the ranked result.
* The rejection reason is recorded internally for diagnostics (§15).
* An infeasible candidate is never sent to Simulation unless explicitly marked `infeasible_for_analysis = true`, in which case its result is recorded but excluded from ranking.

### 7.1 Rejection Reasons

| Reason | Condition |
| --- | --- |
| `DISRUPTION_LOCKED` | The change targets an entity locked by an applied disruption effect |
| `OPERATOR_LOCKED` | The change targets an entity locked by operator provenance |
| `CAPACITY_OUT_OF_BOUNDS` | A capacity or throughput value is outside its configured bounds |
| `INVALID_PARAMETER` | An unsupported parameter, or an invalid parameter/target combination |
| `UNKNOWN_ENTITY` | The target id does not resolve in the graph |
| `EXCLUDED_ENTITY` | The target is in `excluded_entities` |
| `DEMAND_SHARE_INVALID` | Shares do not sum to `1`, are negative, or target a non-active entry |
| `NO_PATH` | Reachability constraint C5 fails for at least one active entry/exit pair |
| `CHANGE_BUDGET_EXCEEDED` | The number of status changes exceeds `max_status_changes` |
| `RESTRICTION_VIOLATION` | The change removes a `restriction` applied by an active disruption |

### 7.2 Optimization Feasibility Is Not Simulation Executability

The two checks are performed by different domains, and they can disagree.

| Check | Owner | Meaning |
| --- | --- | --- |
| **Feasibility** | EV-010 | The candidate satisfies every hard constraint in §8. Decided before any simulation is requested. |
| **Executability** | EV-011 | EV-011 can validate the resulting scenario and execute it. Failure is reported as `INVALID_SCENARIO` or `INVALID_OVERRIDE`. |

A candidate can be **optimization-feasible but simulation-invalid** — for example when a parameter is internally consistent with §6.2 but the resulting scenario fails EV-011's scenario validation. Such a candidate:

* follows the existing EV-010 simulation-failure handling (§12.3) and is **excluded from ranking**, exactly like any other un-evaluated candidate;
* is recorded in `constraints_summary` and `diagnostics` with the reason EV-011 returned;
* is **never** silently ranked as a valid successful result, and is never assigned an assumed outcome.

Feasibility is therefore necessary but **not sufficient** to reach the ranked output. Only a candidate that is feasible **and** returns an acceptable `SimulationResult` can be ranked.

---

## 8. Constraints

Hard constraints are separated from objectives. **A constraint violation makes a strategy infeasible; it is never traded off against an objective.**

| Id | Constraint | Form |
| --- | --- | --- |
| **C1** | Disruption lock | For every entity with an applied disruption effect, the corresponding variable is fixed to the applied value. `x_status[n] = 1` if an applied disruption effect set `status = OPEN`; `x_status[n] = 0` if it set `status = CLOSED`; `v_capacity[n]` and `v_throughput[n]` fixed to their applied values. |
| **C2** | Bounds | `min_node_capacity[n] ≤ v_capacity[n] ≤ capacity[n]`; `min_edge_capacity[e] ≤ v_capacity[e] ≤ capacity[e]`; `min_throughput[n] ≤ v_throughput[n] ≤ throughput_capacity[n]` |
| **C3** | Non-negativity | All capacity and throughput variables are `≥ 0` |
| **C4** | Demand shares | `Σ_g d_share[g] = 1`; `d_share[g] ≥ 0`; `d_share[g] = 0` for `g ∉ active_entries` |
| **C5** | Reachability preservation | For every active entry / active exit pair that has at least one directed path of `OPEN` nodes and `OPEN` edges in the current graph, at least one such path must still exist after the strategy is applied. A `CLOSED` node makes its incident edges unusable (EV-006 §7.4). |
| **C6** | Change budget | `Σ |x_status[·] − current_status[·]| ≤ max_status_changes` |
| **C7** | Restrictions | A `restriction` label applied by an active disruption cannot be removed |
| **C8** | Operational limits | `excluded_entities` are never targeted; configured event/business limits hold (for example a minimum service rate on mandatory checkpoints) |
| **C9** | Domain | Only the variables in §5 exist; only the parameters in §6.2 are usable |

C5 is a deterministic graph check, not a linear program. It is evaluated on the post-strategy graph: node and edge sets are filtered to `OPEN` elements, and directed reachability is tested from each active entry to each active exit. This keeps the MVP model small and explainable instead of introducing a multi-commodity flow formulation.

C5 **preserves** reachability; it does not create it. If an entry/exit pair is already disconnected by an active disruption, the strategy is not required to reconnect it — and it must not try, because the disconnecting change is disruption-locked under C1. Restoring a disconnected route is an operational decision (resolving the disruption or applying an operator change), not an optimization outcome.

---

## 9. Objectives

### 9.1 Objective Terms

| Term | Direction | Metric | Unit |
| --- | --- | --- | --- |
| congestion | minimize | EV-011 `peak_congestion` over affected entities | dimensionless |
| queue size | minimize | EV-011 `peak_queue` over affected entities | people |
| waiting time | minimize | EV-011 `waiting_time` (mean) over affected entities | seconds |
| travel time | minimize | EV-011 `travel_time` (mean) over affected entities | seconds |
| throughput | maximize | EV-011 `throughput` / `arrival_rate` | people/minute |

### 9.2 Objective Function

```text
J(strategy) =  w_congestion  * N(congestion)
             + w_queue       * N(queue_size)
             + w_waiting     * N(waiting_time)
             + w_travel      * N(travel_time)
             - w_throughput  * N(throughput)
             [ + w_risk      * N(risk) ]        optionally enabled
```

```text
N(x) = (x - min_x) / (max_x - min_x)        if max_x > min_x
     = 0                                    otherwise
```

Normalization is min-max across the set of evaluated candidate strategies. All weights are `≥ 0`, at least one weight is `> 0`, and `Σ w = 1` where configured.

**Lower `J` is better.** Congestion, queue, waiting and travel are minimized terms; throughput is maximized and therefore subtracted.

### 9.3 Weights

Weights are **configuration**. No weight is hardcoded, and no weight is derived from disruption severity.

Default configuration:

```text
w_congestion = 0.25
w_queue      = 0.25
w_waiting    = 0.25
w_travel     = 0.15
w_throughput = 0.10
w_risk       = 0.00   (disabled)
```

`w_risk` is zero unless `allow_predicted_risk_term = true`. **Prediction confidence is never an objective term**; it is only used for filtering and tie-breaking under explicit configuration (§12.4, §11.3).

### 9.4 Why the Objective Is Not Handed to the Solver

`J` is a function of **simulation outcomes**, and simulation is not a linear function of the decision variables. The solver therefore cannot optimize `J` directly.

The division of labour is explicit:

| Stage | Performed by | What happens |
| --- | --- | --- |
| 1 | Solver (§10) | Satisfy hard constraints C1–C9 and produce up to `max_candidates` distinct feasible candidate strategies |
| 2 | EV-011 (§12) | Execute each candidate and return measured outcomes |
| 3 | EV-010 (§11) | Compute `J` from those outcomes and rank |

This keeps the objective explainable and avoids presenting a black-box score as an optimization result.

---

## 10. Solver Interface and OR-Tools Mapping

### 10.1 Model-Agnostic Interface

EV-010 defines the interface, not the solver.

```text
StrategySolver
    solve(OptimizationInput) -> CandidateSet | Failure
```

`OptimizationInput` carries the controllable entity sets, variable bounds, current configuration, hard constraints C1–C9 and `max_candidates`. `CandidateSet` is a list of feasible candidate strategies.

The architecture does **not** depend on any solver API. OR-Tools is the MVP implementation, not a requirement.

### 10.2 MVP Implementation — OR-Tools CP-SAT

| Model element | Mapping |
| --- | --- |
| `x_status[n]`, `x_status[e]` | `BoolVar` per controllable entity |
| `v_capacity[n]` | `IntVar` in `[min_node_capacity[n], capacity[n]]` (people) |
| `v_capacity[e]`, `v_throughput[n]` | `IntVar` scaled by `capacity_scale` (default `1000`), so a rate such as `60.5` people/minute is stored as `60500`; the scale is applied on output |
| `d_share[g]` | `IntVar` in `[0, demand_scale]` (default `1000`), with `Σ d_share[g] = demand_scale`, so `250` = `0.25` |
| C1 disruption lock | Variable fixed to the applied value, or the variable is not created |
| C2, C3 | Variable bounds |
| C4 | Linear equality and bounds |
| C6 | Linear inequality over status-change indicator variables |
| C5 reachability | **Not a solver constraint.** Evaluated as a post-processing check per candidate (§8) |
| C7, C8 | Variable exclusion and bound tightening |
| Objective | Optional and linear; see §10.3 |
| Enumeration | `max_candidates` distinct feasible solutions |

CP-SAT is used because the problem is a bounded combinatorial selection problem over discrete levers with linear bounds, not because the simulation objective is linear. Non-linear terms such as reachability are handled deterministically outside the solver, and the true objective is evaluated by simulation.

### 10.3 Solver Objective (Optional)

By default the solver has **no objective** and only satisfies constraints while enumerating up to `max_candidates` distinct feasible solutions.

An optional linear surrogate may be enabled with `use_surrogate_objective = true`. It minimizes intervention magnitude so that, other things being equal, less invasive strategies are enumerated first:

```text
surrogate =  Σ |x_status[·] − current_status[·]|
           + Σ |v_capacity[·] − capacity[·]| / capacity[·]
           + Σ |v_throughput[·] − throughput_capacity[·]| / throughput_capacity[·]
```

Terms with a zero or null denominator are omitted. The surrogate only orders candidate generation. It never replaces `J`, never appears in ranking, and never produces a final score.

### 10.4 Output Mapping

| Solver output | Strategy field |
| --- | --- |
| Assigned `x_status`, `v_capacity`, `v_throughput`, `d_share` differing from current values | `parameter_changes[]` with `previous_value` and `proposed_value` |
| Entity ids touched by those changes | `affected_nodes[]`, `affected_edges[]` |
| Any solver failure or timeout | `OptimizationResult.status = OPTIMIZATION_FAILURE` |

Candidate ordering from the solver is **not** a ranking. Ranking is produced only after simulation (§11).

---

## 11. Ranking

### 11.1 Pipeline

Ranking is deterministic and follows a fixed order.

| Step | Action |
| --- | --- |
| 1 | Keep only **feasible** strategies (§7) |
| 2 | Keep only strategies with a **valid simulation outcome** — `COMPLETED`, or `TERMINATED` where partial results are configured as acceptable |
| 3 | Compute `J` for every remaining strategy (§9.2) |
| 4 | Sort ascending by `J` (lower is better) |
| 5 | Break ties deterministically (§11.3) |
| 6 | Assign `rank` = `1..N` |

Strategies that fail step 1 or step 2 are excluded from ranking and retained only in diagnostics. Failed candidates do not appear in the ranked result.

### 11.2 Ranking Inputs

Ranking considers all of:

* objective outcomes (`J`)
* constraint satisfaction (already applied as a filter)
* simulation outcomes (already applied as a filter)
* predicted risk, only when `allow_predicted_risk_term = true`
* prediction confidence, only for tie-breaking when `use_confidence_tiebreak = true`

Prediction confidence is **not** an objective term by default, and never silently becomes one.

### 11.3 Deterministic Tie-Breaking

Applied in order until the ordering is total:

1. lower predicted risk score, when `allow_predicted_risk_term = true`
2. higher mean prediction confidence of the strategy's relevant predictions, when `use_confidence_tiebreak = true`
3. fewer `parameter_changes`
4. lexicographically smaller `strategy.id`

### 11.4 Predicted Risk

A strategy's `predicted_risk` is the set of EV-009 predictions whose target is one of the strategy's `affected_nodes` or `affected_edges` and whose `status = OK`.

```text
risk_score = Σ over relevant predictions of N(severity_weight × predicted_value)
```

where `severity_weight` is configured per metric. Risk uses predicted metric values, never disruption severity.

---

## 12. Simulation Coupling

### 12.1 Rule

**Every candidate strategy that requires scenario evaluation must go through EV-011.** EV-010 does not simulate, does not extrapolate crowd behaviour, and does not compute expected outcomes itself.

### 12.2 Contract

```text
Optimization ──► SimulationRequest ──► EV-011 ──► SimulationResult ──► Optimization
```

**What Optimization sends**, per candidate:

| Field | Value |
| --- | --- |
| `scenario.id` | Derived scenario id, `<strategy_id>_SCENARIO` |
| `scenario.baseline` | `CURRENT_GRAPH` by default, or a configured baseline reference |
| `scenario.interventions` | The strategy's `parameter_changes`, including any `demand_share` entries (§6.2.1) |
| `scenario.graph_overrides` | Empty — the changes are interventions, not overrides |
| `scenario.crowd_overrides`, `scenario.disruption_overrides` | From configuration; empty by default |
| `scenario.start_time` | Simulation start, from configuration |
| `scenario.duration` | Simulation duration in **seconds**, from configuration |
| `seed` | Simulation seed, from configuration (§17, EV-011) |
| `requested_metrics` | The metric set required for `J` and for `expected_outcome` |
| `strategy_id` | For correlation with the returned result |

**What Optimization receives back:** one `SimulationResult` per request, containing `status`, `metrics`, `events`, `warnings`, `timeline`, `duration` and the reference to the strategy and scenario. All fields and their status values are defined in EV-011.

### 12.3 Failure Handling

| Situation | Behavior |
| --- | --- |
| Result `status = COMPLETED` | Strategy is eligible for ranking |
| Result `status = TERMINATED` | Eligible only if `accept_partial_simulation = true`; otherwise excluded |
| Result `status = INVALID_SCENARIO` or `INVALID_OVERRIDE` | Strategy excluded, recorded in diagnostics with reason |
| Result `status = SIMULATION_FAILURE` or `TIMEOUT` | Strategy excluded, recorded in diagnostics; retried up to `simulation_retry_limit` times (default `0`) |
| **Every** candidate simulation fails | `OptimizationResult.status = SIMULATION_FAILURE` (§15) |

A failed simulation is **never** replaced by an assumed outcome, and a simulated result is never treated as a live operational change.

Every failure in this table is an **executability** failure, not a feasibility failure: a candidate reaches this table only after passing §8. See §7.2.

### 12.4 Prediction Policy

| Policy key | Default | Effect |
| --- | --- | --- |
| `min_prediction_confidence` | `50` | Predictions below this confidence are excluded |
| `max_prediction_age` | `120` seconds | Predictions older than this are excluded |
| `allow_predicted_risk_term` | `false` | Whether predicted risk contributes to `J` |
| `use_confidence_tiebreak` | `true` | Whether confidence participates in tie-breaking |

Predictions with `status = STALE` or `NO_PREDICTION` are never used. A forecast is never treated as current state.

---

## 13. Operator Approval and Live Application

### 13.1 Optimization Never Applies

Optimization never directly applies a live strategy. It ends at a ranked list.

```text
Optimization
     ↓
ranked strategy
     ↓
operator choice / approval
     ↓
operational layer
     ↓
authorized graph change
     ↓
EV-006 Current Graph
     ↓
EV-007 Crowd reacts
```

### 13.2 Live Application Path

The final write path for both disruption-declared effects and approved strategies is the same, and it is the only path.

```text
EV-008 Disruption ──► declared operational effect ──┐
                                                    ├──► Operator / Operational Layer
EV-010 Optimization ──► approved strategy ──────────┘            │
                                                                 ▼
                                                        authorized application
                                                                 │
                                                                 ▼
                                                      EV-006 Current Graph
                                                       (authoritative state)
                                                                 │
                                                                 ▼
                                                      EV-007 Crowd reacts
```

Rules:

* **No EV-009, EV-010 or EV-011 component may directly mutate live graph state.**
* The Initial Graph is immutable and is never touched by an approved strategy.
* The Current Graph changes only after authorized application, through the single write path with provenance (EV-006 §7.5).
* An approved intervention is recorded with `status_source = INTERVENTION`.
* Applying an intervention follows the same reconciliation rule as disruption effects (EV-008 §10.5). An operator-confirmed change is never automatically superseded, and a `restriction` applied by an active disruption cannot be removed by an intervention without operator action.
* A simulation result is never promoted to live state automatically. Promotion is an explicit authorized application.

### 13.3 Operator Approval Object

| Field | Type | Meaning |
| --- | --- | --- |
| `optimization_result_id` | string | The result the operator is acting on |
| `strategy_id` | string | The approved strategy |
| `approved_by` | string | Authorizing actor |
| `approved_at` | timestamp | ISO-8601 UTC |
| `parameter_changes` | `ParameterChange[]` | The exact changes to apply |

Approval payloads and authorization policy belong to the operational layer. EV-010 defines the payload shape so the handoff is implementable.

---

## 14. Output Contract

### 14.1 OptimizationResult Schema

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | Required | `OPTIMIZATION_RESULT_<NUMBER>` |
| `status` | enum | Required | §15 |
| `created_at` | timestamp | Required | ISO-8601 UTC |
| `reason` | enum \| null | Required | Machine-readable reason when `status ≠ SUCCESS` |
| `strategies` | `RankedStrategy[]` | Required | Ranked, feasible, evaluated strategies |
| `ranking` | string[] | Required | Strategy ids in rank order |
| `objective_summary` | object | Required | Weights used, normalization bounds, and each strategy's `J` per term |
| `constraints_summary` | object | Required | Constraints applied, plus the count and rejection reasons of discarded candidates |
| `diagnostics` | object | Optional | Rejected candidates with reasons, failed simulations, solver statistics |
| `input_summary` | object | Optional | Input references and horizons, for traceability |

### 14.2 RankedStrategy Schema

| Field | Type | Meaning |
| --- | --- | --- |
| `rank` | integer | `1..N`, lower is better |
| `strategy` | object | §6.1 |
| `feasible` | boolean | Always `true` in the ranked list |
| `objective` | object | `J` total plus each normalized term |
| `simulation_result_id` | string | Reference into EV-011 results |
| `expected_outcome` | object | §6.3 |
| `predicted_risk` | object \| null | §11.4, when enabled |
| `confidence` | integer \| null | Mean confidence of relevant predictions, when enabled |

### 14.3 Consumers

The result is consumable by the operator UI (ranked strategies with explanations), the backend (structured result), EV-011 (candidate execution inputs) and reporting (objective and constraint summaries).

---

## 15. Failure Handling

| `status` | Meaning | `strategies` populated? | Downstream may continue? |
| --- | --- | --- | --- |
| `SUCCESS` | At least one feasible, evaluated, ranked strategy | Yes | Yes — operator may approve |
| `NO_SOLUTION` | No feasible strategy exists | No | Yes — operator must act manually; reason returned |
| `FALLBACK_SOLUTION` | No strategy met the acceptance threshold, but a feasible strategy exists and fallback is allowed | Yes, flagged as fallback | Yes — operator may approve with awareness |
| `INVALID_INPUT` | Input contract violated (missing or unusable graph, crowd, disruption or prediction input) | No | No — partial results must not be acted on |
| `SIMULATION_FAILURE` | Every candidate simulation failed | No (diagnostics only) | No |
| `OPTIMIZATION_FAILURE` | Solver failure or timeout | No (diagnostics only) | No |

### 15.1 Reasons

| Reason | Applies to |
| --- | --- |
| `NO_FEASIBLE_CANDIDATE` | `NO_SOLUTION` |
| `ALL_SIMULATIONS_FAILED` | `SIMULATION_FAILURE` |
| `SOLVER_TIMEOUT` / `SOLVER_ERROR` | `OPTIMIZATION_FAILURE` |
| `MISSING_GRAPH` / `MISSING_CROWD` / `MISSING_DISRUPTION_STATE` / `INVALID_CONFIGURATION` | `INVALID_INPUT` |
| `THRESHOLD_NOT_MET` | `FALLBACK_SOLUTION` |

### 15.2 Rules

* Failure is never silent. Every non-`SUCCESS` result carries a machine-readable `reason`.
* **An infeasible strategy is never silently returned.** Strategies with `feasible = false` do not appear in `strategies`.
* `FALLBACK_SOLUTION` is produced only when `allow_fallback_solution = true`; otherwise the result is `NO_SOLUTION`.
* Partial results are valid only for `FALLBACK_SOLUTION` and are explicitly flagged.
* `INVALID_INPUT`, `SIMULATION_FAILURE` and `OPTIMIZATION_FAILURE` produce no actionable ranking at all.

---

## 16. Domain Boundary and Ownership Matrix

### 16.1 Cross-Document Ownership Matrix

| Concern | Single authoritative owner | Consumers |
| --- | --- | --- |
| Graph topology, nodes, directed edges | **EV-006** | EV-007, EV-009, EV-010, EV-011 |
| Graph configuration: `capacity` (people), `throughput_capacity` (people/minute), edge `capacity` (people/minute), `distance`, times | **EV-006** | EV-007, EV-009, EV-010, EV-011 |
| Graph status (`OPEN` / `CLOSED`) and `status_source` provenance | **EV-006**, written only by the operational layer | EV-007, EV-009, EV-010, EV-011 |
| Initial Graph and Current Graph identity | **EV-006** | EV-011, operational layer |
| Crowd groups, states, movement, routing execution | **EV-007** | EV-009, EV-010, EV-011 |
| Crowd occupancy, flow, queue, waiting, travel, throughput, utilization, density, overload | **EV-007** | EV-009, EV-010, EV-011 |
| Disruption identity, type, affected entities, severity, lifecycle, timing, declared effects | **EV-008** | EV-009, EV-010, EV-011, operational layer |
| Predictions, confidence, staleness, explanation | **EV-009** | EV-010, EV-011 |
| Strategy, feasibility, objective, ranking | **EV-010** | EV-011, operator UI |
| Scenario, scenario time, simulation result, metrics | **EV-011** | EV-010, operator UI |
| Live approval and application of graph changes | **Operational layer** | EV-006 |

No concern has two authoritative owners. No domain computes a value owned by another.

### 16.2 Explicit Non-Behaviours

* EV-010 does not write graph state.
* EV-010 does not modify disruptions or their lifecycle.
* EV-010 does not compute crowd metrics.
* EV-010 does not produce forecasts.
* EV-010 does not execute scenarios or manage simulation time.
* EV-010 does not apply anything to live operations.
* EV-010 does not convert disruption severity into any numeric value.

---

## 17. MVP Requirements

| Requirement | MVP behavior |
| --- | --- |
| Question answered | "What could we change, and what would happen if we changed it?" |
| Decision variables | Six bounded variables over status, capacity, throughput and demand share only |
| Strategy schema | Exact schema with unit-carrying parameter changes |
| Feasibility | Nine hard constraints; infeasible candidates discarded with recorded reasons |
| Objective | Explicit weighted scalarization over normalized simulation metrics; lower is better |
| Weights | Configuration only; never derived from severity; never hardcoded |
| Solver | Model-agnostic interface; OR-Tools CP-SAT as the MVP implementation |
| Simulation coupling | Every evaluated candidate goes through EV-011; no assumed outcomes |
| Ranking | Deterministic pipeline with defined tie-breaking |
| Confidence | Filter and tie-break input only; never an objective term by default |
| Approval | Operator approval required; payload shape defined; operational layer applies |
| Write path | Single authorized path; Initial Graph immutable; `status_source = INTERVENTION` |
| Output | `OptimizationResult` with ranking, objective summary and constraints summary |
| Failure | Six structured statuses with explicit reasons and partial-result validity |
| Complexity | Deterministic, explainable, bounded; no RL, no agents, no black-box scoring |

---

## 18. Example

Continuing the scenario from EV-006 §18, EV-007 §27, EV-008 §27 and EV-009 §16.

### 18.1 Input State at 19:01:00

```text
Graph (Current Graph)
    GATE_01        status CLOSED       status_source DISRUPTION   (DISRUPTION_001, ACTIVE)
    EXIT_01        status CLOSED       status_source CONFIGURED
    CHECKPOINT_01  capacity 400 people throughput_capacity 60 people/minute
                                       status_source DISRUPTION   (DISRUPTION_002, ACTIVE)
    EDGE_07        status CLOSED (its endpoint EXIT_01 is CLOSED)
    active_entries = ["TRANSIT_01", "GATE_01"]     active_exits = ["EXIT_01"]

Crowd (EV-007)
    CHECKPOINT_01  occupancy 400 people, queue_size 400 people
                   inflow 0 people/minute, throughput 60 people/minute
    ZONE_01        occupancy 9,600 of 10,000 people capacity (resident population)

Predictions (EV-009)
    PRED_0007  CHECKPOINT_01  queue_size   100 people      @ +300 s  confidence 60  OK
    PRED_0008  CHECKPOINT_01  waiting_time 100 seconds     @ +300 s  confidence 60  OK
    PRED_0009  CHECKPOINT_01  congestion   0.25 dimensionless @ +300 s confidence 60  OK
    PRED_0010  GATE_01        availability UNAVAILABLE     @ +300 s  confidence 60  OK
```

**Operational situation.** The arena cannot be left, because `EXIT_01` is `CLOSED` and `EDGE_07` is unusable. Road-side ingress is blocked by `DISRUPTION_001`. `ZONE_01` therefore keeps filling at the `CHECKPOINT_01` discharge rate of `60` people/minute and overloads.

The checkpoint's own queue behaves in the opposite direction: C1 locks its service rate at `60` people/minute and `EDGE_05` gives it no inflow, so its queue can only drain from its `400`-person starting value. Any candidate that reduced checkpoint congestion would have to attack the disruption lock itself, which C1 forbids. This asymmetry — the venue interior deteriorating while the checkpoint queue drains — is what the candidates below are competing to change.

**Reachability note.** Under C5, `GATE_01` being `CLOSED` means that no active entry currently reaches `EXIT_01`, so C5 is vacuously satisfied in this scenario. Optimization cannot reconnect the venue and must not try, because the disconnecting change is disruption-locked by C1. Restoring ingress is an operator decision on `DISRUPTION_001`.

### 18.2 Configured Model

```text
controllable_nodes        = ["EXIT_01"]
controllable_edges        = []
allow_demand_rebalancing  = true
allow_node_capacity_change = false
allow_throughput_change   = false
max_status_changes        = 1
reachability_policy       = PRESERVE_EXISTING
max_candidates            = 6
simulation duration       = 600 seconds

w_congestion = 0.25   w_queue = 0.25   w_waiting = 0.25
w_travel     = 0.15   w_throughput = 0.10   w_risk = 0.00
```

`GATE_01` and `CHECKPOINT_01` are **disruption-locked** by C1, so no candidate can reopen the gate or raise the checkpoint service rate. This is the core safety property of the model.

### 18.3 Candidate Generation

| Candidate | Changes | Feasible? |
| --- | --- | --- |
| `STRATEGY_01` | none (control) | yes |
| `STRATEGY_02` | `EXIT_01` status `CLOSED` → `OPEN` | yes |
| `STRATEGY_03` | `EXIT_01` → `OPEN`; demand shares `TRANSIT_01 = 1.0`, `GATE_01 = 0.0` | yes |
| `STRATEGY_04` | demand shares `TRANSIT_01 = 1.0`, `GATE_01 = 0.0` | yes |
| `STRATEGY_05` | `GATE_01` status `CLOSED` → `OPEN` | **no** — `DISRUPTION_LOCKED` (C1) |
| `STRATEGY_06` | `CHECKPOINT_01` `throughput_capacity` `60` → `120` people/minute | **no** — `DISRUPTION_LOCKED` (C1) |

`STRATEGY_05` and `STRATEGY_06` are discarded from ranking. Their rejection reasons are recorded in `constraints_summary` and `diagnostics`. They are not returned as strategies.

### 18.4 Simulation Outcomes

Each feasible candidate is sent to EV-011 as a scenario with `baseline = CURRENT_GRAPH`, `duration = 600` seconds, `seed = 42`. Illustrative results:

| Candidate | `peak_congestion` (dimensionless) | `peak_queue` (people) | `waiting_time` mean (seconds) | `travel_time` mean (seconds) | `throughput` (people/minute) |
| --- | --- | --- | --- | --- | --- |
| `STRATEGY_01` | 1.024 | 400 | 310 | 165 | 48 |
| `STRATEGY_02` | 0.990 | 400 | 250 | 142 | 55 |
| `STRATEGY_03` | 0.960 | 400 | 180 | 128 | 62 |
| `STRATEGY_04` | 1.018 | 400 | 285 | 158 | 51 |

Metric scope matters here, because the two congestion-scoped columns measure different entities:

* `peak_congestion` is scoped to `ZONE_01` — the EV-007 load ratio `peak_occupancy / capacity` at a capacity of `10,000` people. The corresponding peak occupancies are `10,240`, `9,900`, `9,600` and `10,180` people. `ZONE_01` is where the operating constraint actually bites in this scenario.
* `peak_queue` is scoped to `CHECKPOINT_01` and is `400` — its starting value — in **every** run, because no candidate can give the checkpoint more service or more inflow (§18.1). The term therefore contributes no differentiation between these candidates.

That flat column is the correct and expected consequence of the disruption lock, not a missing measurement. It also agrees with the forecasts in §18.1: `PRED_0007` projected `CHECKPOINT_01`'s queue at `100` people `300` seconds ahead, which is exactly what a `400`-person queue served at a locked `60` people/minute and receiving no inflow produces. The prediction's declining value and the simulation's flat peak are the same trajectory measured two different ways — a peak and a point value, not a disagreement.

§18.5 reports the resulting zero-width normalization range explicitly rather than concealing it, and §18.6 explains the effect on the ranking.

`throughput` is the run's `arrival_rate` (`arrived_population / duration`), computed by EV-011. The full metric set, including `time_to_congestion` and `recovery_time`, is in EV-011 §14.

### 18.5 Objective Evaluation

Min-max normalization across the four evaluated candidates:

```text
peak_congestion  min 0.960  max 1.024  range 0.064
waiting_time     min 180    max 310    range 130
travel_time      min 128    max 165    range 37
throughput       min 48     max 62     range 14
peak_queue       min 400    max 400    range 0
```

When `max = min`, the normalization denominator is zero. §11.4 defines the result as `N = 0` for every candidate rather than dividing by zero, so the term drops out of the comparison instead of producing an undefined or arbitrary contribution.

```text
J = 0.25 * N(queue) + 0.25 * N(congestion) + 0.25 * N(waiting)
  + 0.15 * N(travel) - 0.10 * N(throughput)

STRATEGY_01  N = (0.000, 1.0000, 1.0000, 1.0000, 0.0000)
             J = 0.000 + 0.250 + 0.250 + 0.150 - 0.100 * 0.000 =  0.650

STRATEGY_02  N = (0.000, 0.4688, 0.5385, 0.3784, 0.5000)
             J = 0.000 + 0.117 + 0.135 + 0.057 - 0.050 =          0.259

STRATEGY_03  N = (0.000, 0.0000, 0.0000, 0.0000, 1.0000)
             J = 0.000 + 0.000 + 0.000 + 0.000 - 0.100 =         -0.100

STRATEGY_04  N = (0.000, 0.9063, 0.8077, 0.8108, 0.2143)
             J = 0.000 + 0.227 + 0.202 + 0.122 - 0.021 =          0.529
```

### 18.6 Ranking

Sorted ascending by `J` (lower is better):

| Rank | Strategy | `J` | Changes |
| --- | --- | --- | --- |
| **1** | `STRATEGY_03` | **-0.100** | Open `EXIT_01`; rebalance demand to `TRANSIT_01` |
| 2 | `STRATEGY_02` | 0.259 | Open `EXIT_01` |
| 3 | `STRATEGY_04` | 0.529 | Rebalance demand to `TRANSIT_01` |
| 4 | `STRATEGY_01` | 0.650 | No change (control) |

The ordering is driven entirely by `peak_congestion`, `waiting_time`, `travel_time` and `throughput`, because the `peak_queue` term is identically zero for all four candidates (§18.5). The ranking is still meaningful — it separates four materially different outcomes on four other objectives — but it is **not** measuring checkpoint queue relief, and an operator reading the result should know that. `objective_summary` records the zero-width range so the limitation is visible in the output rather than inferred.

`OptimizationResult.status = SUCCESS`, `reason = null`, `ranking = ["STRATEGY_03", "STRATEGY_02", "STRATEGY_04", "STRATEGY_01"]`.

`objective_summary` records the weights, the normalization bounds and each strategy's normalized terms, so the ranking is fully explainable to the operator.

`constraints_summary` records that C1 rejected candidates targeting `GATE_01` and `CHECKPOINT_01`.

### 18.7 Approval and Application

```text
Operator approves STRATEGY_03
        │
        ▼
Operational layer receives Approval
    optimization_result_id = OPTIMIZATION_RESULT_0001
    strategy_id            = STRATEGY_03
    parameter_changes      = [ EXIT_01 status CLOSED -> OPEN,
                               demand share TRANSIT_01 1.0, GATE_01 0.0 ]
        │
        ▼
Authorized application through the single graph write path
        │
        ▼
EV-006 Current Graph
    EXIT_01.status = OPEN       status_source = INTERVENTION
        │
        ▼
EV-007 Crowd reacts
    recomputes availability, routes and crowd metrics under the new configuration
```

If `DISRUPTION_001` later resolves, the operational layer withdraws its status effect, but only while `GATE_01`'s provenance is still `DISRUPTION` (EV-008 §10.5, EV-006 §7.5). The approved `EXIT_01` change is unaffected because its provenance is `INTERVENTION`.

**Boundary check:** EV-010 generated and ranked candidates, simulated nothing itself, applied nothing, modified no disruption, and interpreted no severity.

---

## 19. Architectural Summary

EV-010 is the strategic decision layer. It proposes bounded changes, proves their feasibility, has them executed in a sandbox, and ranks the measured outcomes for an operator to approve.

Key invariants:

* EV-010 answers "what could we change, and what would happen if we changed it?" and never applies a live change.
* Decision variables are limited to node/edge status, node holding capacity (people), edge flow capacity (people/minute), node service rate (people/minute) and entry demand share (dimensionless). Nothing else is decidable, so arbitrary graph mutation is impossible.
* Disruption-applied values are locked by constraint C1, so optimization can never silently override a disruption.
* Hard constraints are separate from objectives, and a constraint violation makes a strategy infeasible rather than tradeable.
* `J` is an explicit weighted scalarization over normalized simulation metrics, with configuration weights, defined directions and no severity-derived terms.
* Prediction confidence is a filter and a tie-break input, never an objective term by default.
* The solver satisfies constraints and enumerates bounded candidates. The true objective is evaluated by simulation, and this division is stated rather than hidden.
* Ranking is deterministic and fully explained through `objective_summary` and `constraints_summary`.
* Every evaluated candidate goes through EV-011, and simulation failures are explicit, never substituted with assumed outcomes.
* Approval is mandatory; approval produces an `Approval` payload; the operational layer applies it through the single graph write path with `status_source = INTERVENTION`.
* The Initial Graph is immutable, and no EV-009, EV-010 or EV-011 component mutates live state.
* Failure is structured across six statuses, with explicit partial-result validity and machine-readable reasons.
