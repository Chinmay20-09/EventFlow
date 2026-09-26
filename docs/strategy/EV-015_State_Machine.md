# EV-015 — State Machine

## 1. Document Purpose

This document defines the Strategy Set lifecycle that P3 must store and enforce.

The state machine prevents invalid workflow actions such as executing a strategy that has not been simulated and approved.

## 2. Scope

The MVP uses the **Strategy Set** as the primary workflow unit.

Individual strategies do not require an independent full lifecycle.

## 3. States

| State        | Meaning                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `PROPOSED`   | A Strategy Set exists but has not completed simulation.                    |
| `SIMULATING` | A simulation attempt is currently being processed.                         |
| `SIMULATED`  | A valid simulation result is available for Coordinator review.             |
| `APPROVED`   | A Coordinator has explicitly approved the Strategy Set.                    |
| `REJECTED`   | The Coordinator has rejected the Strategy Set.                             |
| `EXECUTING`  | The approved operational action is being applied by the operational layer. |
| `COMPLETED`  | Execution finished successfully.                                           |
| `FAILED`     | The current simulation or execution operation failed.                      |

## 4. Main Lifecycle

```text
PROPOSED
    ↓
SIMULATING
    ↓
SIMULATED
    ↓
Coordinator Approval
    ↓
APPROVED
    ↓
Automatic execution trigger
    ↓
EXECUTING
    ↓
COMPLETED
```

## 5. Failure / Rejection Paths

```text
SIMULATING → FAILED
EXECUTING  → FAILED

SIMULATED → REJECTED
```

`FAILED` and `REJECTED` have different meanings.

### FAILED

`FAILED` represents a runtime failure of the current simulation or execution operation.

For example:

```text
SIMULATING → FAILED
```

means the current simulation attempt could not complete successfully.

```text
EXECUTING → FAILED
```

means the operational execution could not complete successfully.

### REJECTED

`REJECTED` represents an explicit decision not to proceed with the Strategy Set.

For example:

```text
SIMULATED → REJECTED
```

means the Coordinator rejected the simulated Strategy Set.

A failed simulation attempt does not automatically mean the Strategy Set is rejected.

If the permitted simulation attempts are exhausted without producing an acceptable result, the current decision workflow may be closed as rejected.

## 6. Transition Rules

### PROPOSED → SIMULATING

Allowed when a simulation is requested.

P3 verifies:

* Strategy Set exists;
* Strategy Set is in `PROPOSED`;
* simulation attempt limit has not been reached.

### SIMULATING → SIMULATED

Occurs when the simulation result is successfully received and accepted.

### SIMULATING → FAILED

Occurs when the current simulation attempt fails.

P3 records the failure information required for the active workflow.

The failed Strategy Set does not require permanent historical storage for the MVP.

### SIMULATED → APPROVED

Allowed only through the controlled approval endpoint and only for an authenticated Coordinator.

Approval automatically triggers the execution workflow.

### SIMULATED → REJECTED

Allowed through the controlled rejection action.

### APPROVED → EXECUTING

Triggered automatically after successful explicit Coordinator approval.

There is no separate manual Execute action in the MVP.

### EXECUTING → COMPLETED

Occurs when the operational layer reports successful application.

### EXECUTING → FAILED

Occurs when the operational action cannot be completed.

## 7. Maximum Simulation Attempts

The MVP allows a maximum of two simulation attempts.

The configured value is:

```text
MAX_SIMULATION_ATTEMPTS=2
```

P3 may track the active workflow's:

```text
attempt_count
latest_result
failure_reason
```

If an attempt fails, the responsible strategy/simulation component may revise or provide a new Strategy Set.

P3 does not invent the revised strategy.

If the permitted attempts are exhausted without a valid simulation result, the current workflow may be closed as rejected.

The MVP does **not** require permanent storage of every failed or rejected Strategy Set.

## 8. No STALE State

The MVP does not define a `STALE` state.

If conditions change enough that the previous decision is no longer suitable, the system can be re-simulated instead of introducing a new lifecycle state.

## 9. Invalid Transitions

Examples of invalid transitions:

```text
PROPOSED  → APPROVED
SIMULATED → EXECUTING directly
PROPOSED  → COMPLETED
COMPLETED → EXECUTING
FAILED    → COMPLETED
```

P3 rejects invalid transitions.

## 10. State and API Relationship

State changes occur through controlled actions rather than generic updates.

Examples:

```text
POST /api/strategy-sets/{id}/simulate
POST /api/strategy-sets/{id}/approve
POST /api/strategy-sets/{id}/reject
```

There is no separate `/execute` action in the locked MVP workflow.

## 11. Example

```text
Strategy Set
      ↓
PROPOSED
      ↓
SIMULATING
      ↓
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

Failure example:

```text
SIMULATING
      ↓
FAILED
      ↓
Permitted retry / revised candidate
      ↓
SIMULATING
```

Rejection example:

```text
SIMULATED
      ↓
Coordinator rejects
      ↓
REJECTED
```

## 12. P3 Implementation Rule

The state machine should be enforced in one backend workflow/service layer rather than being duplicated inconsistently across multiple API handlers.

Database writes must not bypass these rules.

## 13. Related Documents

* EV-010 — Optimization
* EV-011 — Simulation
* EV-016 — API
* EV-022 — Execution Model
* EV-023 — Security
* EV-024 — Error Handling
* EV-029 — Configuration
