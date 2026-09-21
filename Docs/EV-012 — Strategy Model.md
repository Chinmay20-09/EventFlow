**Priority:** MUST
**Status:** MVP Specification
**Version:** 1.0

## 1. Purpose

This document defines the structure, behavior, parameters, constraints, and lifecycle of a **mitigation strategy** in EventFlow.
A mitigation strategy represents a structured operational action or combination of actions intended to reduce an identified event risk, crowding condition, bottleneck, or operational problem.

The Strategy Model provides a common structure that can be understood by:

* The P2 AI / Strategy Intelligence layer
* The P1 deterministic Core Engine
* The organizer interface
* The approval and execution workflow

The model ensures that AI-generated recommendations are converted into structured, validated strategies before they are evaluated or executed.

---

## 2. Architectural Principle

EventFlow separates **strategy intelligence** from **deterministic simulation**.

The P2 AI layer may:

* Understand organizer requests.
* Identify relevant mitigation strategies.
* Generate candidate strategies.
* Select parameters from allowed ranges.
* Explain why a strategy may be useful.
* Interpret simulation results.

The P1 Core Engine is responsible for:

* Mathematical calculations.
* Capacity calculations.
* Crowd-flow calculations.
* Constraint validation.
* Risk calculations.
* Strategy simulation.
* Measurement of strategy effects.

Therefore:

> **P2 proposes and explains strategies; P1 validates, simulates, and calculates their effects.**

The AI must never become the authoritative source for mathematical event-safety decisions.

---

# 3. Definition of a Mitigation Strategy

A mitigation strategy is a structured representation of an action or set of actions designed to improve an identified event condition.

A strategy contains:

```text
Strategy
├── Identity
├── Objective
├── Trigger
├── Actions
├── Parameters
├── Constraints
├── Required Inputs
├── Expected Effects
└── Approval Requirements
```

Example:

```text
Gate Flow Redistribution

Objective:
Reduce congestion at an overloaded gate.

Action:
Redirect a percentage of incoming attendees
from one gate to another.

Parameters:
- Source gate
- Target gate
- Redirect percentage

Constraints:
- Target gate must be operational.
- Target gate must have available capacity.
```

---

# 4. Strategy Identity

Every strategy must have a unique identifier.

### Required fields

| Field         | Description                       |
| ------------- | --------------------------------- |
| `strategy_id` | Unique strategy identifier        |
| `name`        | Human-readable strategy name      |
| `version`     | Strategy definition version       |
| `description` | Short explanation of the strategy |

Example:

```json
{
  "strategy_id": "ST-001",
  "name": "Gate Flow Redistribution",
  "version": "1.0",
  "description": "Redirect incoming attendee flow from an overloaded gate to an available alternative gate."
}
```

---

# 5. Strategy Objective

Each strategy must define the problem it is intended to address.

Possible objectives include:

* Reduce crowd congestion.
* Reduce gate utilization.
* Reduce zone occupancy.
* Redistribute attendee flow.
* Reduce risk in a specific area.
* Prevent further crowd accumulation.
* Improve evacuation flow.
* Maintain operational capacity.

Example:

```json
{
  "objective": "Reduce congestion at an overloaded entry gate."
}
```

The objective describes **what the strategy is intended to achieve**, not the numerical result.

The actual effect is determined by P1.

---

# 6. Trigger Conditions

A strategy may be associated with one or more conditions under which it becomes relevant.

Examples:

```text
Gate utilization > configured threshold
```

```text
Zone density > configured threshold
```

```text
Bottleneck detected
```

```text
Entry flow exceeds configured capacity
```

```text
Organizer explicitly requests congestion mitigation
```

A trigger indicates when a strategy should be considered.

It does not automatically mean the strategy should be executed.

---

# 7. Strategy Actions

A strategy consists of one or more actions.

An action represents an operational change that can be passed to the deterministic engine for evaluation.

Examples:

* Redirect entry flow.
* Redirect exit flow.
* Activate an alternative gate.
* Restrict access to a zone.
* Temporarily hold incoming attendees.
* Divert a route.
* Redistribute exit flow.

Example:

```json
{
  "actions": [
    {
      "type": "redirect_entry_flow",
      "source": "Gate_A",
      "target": "Gate_C"
    }
  ]
}
```

Only actions supported by the EventFlow Strategy Catalog may be used by the MVP.

The AI must not invent arbitrary action types.

---

# 8. Strategy Parameters

Parameters control how an action is applied.

Common parameters include:

| Parameter             | Example      |
| --------------------- | ------------ |
| `source_gate`         | `Gate_A`     |
| `target_gate`         | `Gate_C`     |
| `redirect_percentage` | `20`         |
| `zone_id`             | `Zone_B`     |
| `duration`            | `15 minutes` |
| `route_id`            | `Route_03`   |
| `restriction_level`   | `PARTIAL`    |

Parameters must be:

1. Explicitly defined.
2. Type-valid.
3. Within configured limits.
4. Compatible with the selected strategy.
5. Validated before simulation.

---

# 9. Parameter Validation

P2 may produce candidate parameter values, but P1 must perform authoritative validation.

For example, P2 may produce:

```json
{
  "strategy_id": "ST-001",
  "redirect_percentage": 20
}
```

P1 determines whether:

```text
20%
```

is valid for the current event configuration.

If the parameter is invalid:

```text
Strategy
   ↓
Parameter Validation
   ↓
INVALID
   ↓
No Simulation
   ↓
Return Validation Error
```

P2 can then explain the error to the organizer.

---

# 10. Constraints

Constraints define conditions that must be satisfied for a strategy to be valid.

Examples:

* Target gate must be operational.
* Target gate must have sufficient available capacity.
* Route must exist.
* Alternative zone must be accessible.
* Restricted zone must not contain a prohibited emergency route.
* Action parameters must remain within configured limits.

Example:

```json
{
  "constraints": [
    "target_gate_operational",
    "target_gate_has_capacity",
    "redirect_percentage_within_limit"
  ]
}
```

Constraints are authoritative when evaluated by P1.

---

# 11. Required Inputs

A strategy may require event data before it can be evaluated.

Example:

```text
Gate Flow Redistribution requires:

- Current gate status
- Current gate utilization
- Target gate status
- Target gate capacity
- Current attendee flow
- Configured redistribution limit
```

The AI should not assume missing values.

If required information is unavailable, P2 should request the necessary information from the engine or indicate that evaluation cannot currently be performed.

---

# 12. Expected Effects

Each strategy should define the types of effects it is intended to influence.

Examples:

```text
Expected measurable effects:

- Gate utilization
- Crowd density
- Queue size
- Flow distribution
- Risk level
- Travel distance
```

These are **metrics to evaluate**, not predetermined results.

For example, the strategy may state:

```text
Expected effect:
Reduce Gate A congestion.
```

It must not state:

```text
Gate A congestion will decrease by 37%.
```

unless that value has been produced by P1 simulation.

---

# 13. Strategy Schema

The standard MVP representation is:

```json
{
  "strategy_id": "ST-001",
  "name": "Gate Flow Redistribution",
  "version": "1.0",
  "objective": "Reduce congestion at an overloaded gate",

  "trigger": {
    "condition": "gate_congestion"
  },

  "actions": [
    {
      "type": "redirect_entry_flow",
      "source": "Gate_A",
      "target": "Gate_C"
    }
  ],

  "parameters": {
    "redirect_percentage": 20
  },

  "constraints": [
    "target_gate_operational",
    "target_gate_has_capacity",
    "redirect_percentage_within_limit"
  ],

  "expected_effects": [
    "reduce_gate_utilization",
    "redistribute_entry_flow",
    "reduce_congestion"
  ],

  "approval_required": true
}
```

---

# 14. Strategy Lifecycle

A strategy follows the following lifecycle:

```text
                    ┌─────────────────┐
                    │ Risk / Problem  │
                    │    Detected     │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │ Identify        │
                    │ Strategies      │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │ Generate        │
                    │ Structured      │
                    │ Strategy        │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │ Validate        │
                    │ Parameters      │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │ Simulate        │
                    │ using P1        │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │ Interpret       │
                    │ Results         │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │ Organizer       │
                    │ Approval        │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │ Execution       │
                    └─────────────────┘
```

---

# 15. P2 Responsibilities

P2 owns the intelligence surrounding the strategy.

### P2 may:

* Understand natural-language requests.
* Identify the relevant event problem.
* Select relevant strategies from the catalog.
* Generate structured strategy candidates.
* Populate allowed parameters.
* Explain strategy objectives.
* Explain why a strategy was suggested.
* Present alternative strategies.
* Interpret P1 simulation results.
* Explain trade-offs to the organizer.

---

# 16. P1 Responsibilities

P1 owns deterministic evaluation.

### P1 must:

* Validate strategy parameters.
* Validate constraints.
* Calculate capacity.
* Calculate crowd flow.
* Calculate risk.
* Simulate strategy effects.
* Return measurable results.
* Identify mathematical bottlenecks.
* Reject invalid strategies.

P1 results are treated as the source of truth for numerical and simulation information.

---

# 17. AI vs Deterministic Engine

The following separation is mandatory:

| Responsibility                 |                   P2 AI |         P1 Engine |
| ------------------------------ | ----------------------: | ----------------: |
| Understand organizer request   |                       ✓ |                   |
| Identify intent                |                       ✓ |                   |
| Select candidate strategy      |                       ✓ |                   |
| Generate explanation           |                       ✓ |                   |
| Generate structured command    |                       ✓ |                   |
| Validate numerical feasibility |                         |                 ✓ |
| Calculate capacity             |                         |                 ✓ |
| Calculate crowd density        |                         |                 ✓ |
| Calculate risk                 |                         |                 ✓ |
| Simulate strategy              |                         |                 ✓ |
| Calculate strategy impact      |                         |                 ✓ |
| Explain simulation result      |                       ✓ |                   |
| Human approval workflow        | Interface/Orchestration | Execution support |

---

# 18. Example End-to-End Scenario

### Organizer Request

> "Gate A is getting crowded. Can we redirect some people to Gate C?"

### Step 1 — P2 Understands Intent

```json
{
  "intent": "evaluate_mitigation",
  "problem": "gate_congestion",
  "source_gate": "Gate_A",
  "target_gate": "Gate_C"
}
```

### Step 2 — P2 Selects Strategy

```text
ST-001 — Gate Flow Redistribution
```

### Step 3 — P2 Creates Structured Request

```json
{
  "strategy_id": "ST-001",
  "source_gate": "Gate_A",
  "target_gate": "Gate_C",
  "redirect_percentage": 20
}
```

### Step 4 — P1 Validates

P1 checks:

```text
Is Gate C operational?
Does Gate C have available capacity?
Is 20% within the configured limit?
```

### Step 5 — P1 Simulates

P1 returns:

```json
{
  "strategy_id": "ST-001",
  "valid": true,
  "gate_a_utilization_before": 0.93,
  "gate_a_utilization_after": 0.74,
  "gate_c_utilization_after": 0.68
}
```

### Step 6 — P2 Interprets

P2 responds:

> "The engine validated the redistribution strategy. Redirecting 20% of the incoming flow from Gate A to Gate C reduces the modeled utilization of Gate A from 93% to 74%, while Gate C remains within its modeled capacity."

The AI did **not** calculate those values.

---

# 19. Invalid Strategy Example

Organizer:

> "Send 80% of the crowd to Gate C."

P2 creates the candidate strategy.

P1 checks the constraints and returns:

```json
{
  "valid": false,
  "reason": "Target gate capacity constraint violated"
}
```

P2 explains:

> "The requested redistribution cannot be validated because Gate C does not have sufficient modeled capacity to receive 80% of the incoming flow."

The AI must not override the result.

---

# 20. Strategy Comparison

Multiple strategies may be evaluated.

Example:

```text
Organizer:
"What are my options for reducing congestion at Gate A?"
```

P2 may identify:

```text
ST-001 — Gate Flow Redistribution
ST-002 — Alternative Gate Activation
ST-004 — Crowd Holding
```

P1 evaluates each strategy.

P2 then summarizes:

```text
Strategy A
→ Lower Gate A utilization
→ Requires Gate C

Strategy B
→ Uses alternative entry point
→ Requires gate activation

Strategy C
→ Reduces immediate incoming flow
→ May increase waiting time
```

P2 presents the trade-offs.

P1 provides the underlying measurements.

---

# 21. Failure Handling

If P1 is unavailable:

```text
P2
 ↓
Tool Call
 ↓
P1 unavailable
 ↓
P2 reports inability to validate
```

Example:

> "I couldn't validate the proposed strategy because the simulation engine is currently unavailable."

The AI must not fabricate a result.

---

# 22. Unsupported Strategy Handling

If the organizer requests an action that is not in the MVP Strategy Catalog:

> "Close every entrance and reroute everyone through a temporary tunnel."

If no corresponding strategy exists, P2 must not invent one and execute it.

Instead:

> "That action is not currently supported by the EventFlow strategy catalog."

---

# 23. Versioning

Strategies should be versioned.

Example:

```text
ST-001 v1.0
ST-001 v1.1
```

Changes to:

* Actions
* Parameters
* Constraints
* Evaluation behavior

should result in an updated strategy version.

---

# 24. Security and Guardrails

The strategy model must prevent the LLM from directly modifying the underlying simulation.

The AI should interact with strategies through controlled structured interfaces.

Recommended flow:

```text
LLM
 ↓
Structured Strategy
 ↓
Schema Validation
 ↓
P1 Validation
 ↓
P1 Simulation
```

Never:

```text
LLM
 ↓
Direct modification of P1 state
```

---

# 25. MVP Requirements

The MVP implementation must support:

* Structured strategy representation.
* Unique strategy IDs.
* Defined actions.
* Defined parameters.
* Parameter validation.
* Constraint validation.
* P1 simulation.
* P2 explanation.
* Strategy catalog integration.
* Human approval where required.

Advanced autonomous strategy generation is not required for the initial MVP.

---

# 26. Success Criteria

EV-012 is considered successfully implemented when:

1. Every supported mitigation strategy has a standardized structure.
2. Strategies can be represented in machine-readable form.
3. Strategy parameters can be validated.
4. Strategies can be passed to the deterministic engine.
5. P1 can return measurable strategy results.
6. P2 can explain those results to the organizer.
7. The AI cannot bypass P1 validation.
8. Unsupported strategies cannot be executed.
9. The strategy definition is independent from the numerical simulation logic.

---

# 27. Key Principle

> **A mitigation strategy is a structured, validated description of an operational action. P2 identifies, structures, and explains strategies, while P1 remains responsible for deterministic validation, simulation, and numerical results.**
