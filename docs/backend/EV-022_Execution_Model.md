# EV-022 — Execution Model

## 1. Document Purpose

This document explains how a Coordinator-approved Strategy Set moves into execution and what P3 records during that process.

## 2. Key Principle

Approval and execution are separate **workflow stages**, but they are not separate manual user actions.

The locked MVP workflow is:

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
Operational action applied
    ↓
COMPLETED
```

Failure:

```text
EXECUTING → FAILED
```

Human approval remains mandatory.

The system may automatically execute only after explicit Coordinator approval.

## 3. Approval

Approval uses:

```text
POST /api/strategy-sets/{strategy_set_id}/approve
```

P3 verifies:

* Strategy Set exists;
* current state is `SIMULATED`;
* required simulation result exists;
* requester is an authenticated Coordinator.

P3 then:

1. records the approval;
2. records the Coordinator identity;
3. records the time;
4. changes the Strategy Set to `APPROVED`;
5. automatically triggers the P5/operational execution workflow.

Approval does not mean autonomous approval.

The Coordinator must explicitly approve first.

## 4. Rejection

Rejection is a controlled action:

```text
POST /api/strategy-sets/{strategy_set_id}/reject
```

It is allowed from the appropriate decision state according to EV-015.

Rejected Strategy Sets do not require permanent historical storage for the MVP.

## 5. Automatic Execution Trigger

There is no separate manual execution request after approval.

After:

```text
POST /api/strategy-sets/{strategy_set_id}/approve
```

successfully completes:

```text
APPROVED
    ↓
Automatic execution trigger
    ↓
EXECUTING
```

P3 sends the approved decision to the P5/operational layer.

The operational layer is responsible for applying the authorized operational change.

## 6. No Separate Execute Endpoint

The MVP does not expose:

```text
POST /api/strategy-sets/{strategy_set_id}/execute
```

The Coordinator's approval is the human decision point.

The backend then automatically starts the execution workflow.

## 7. Operational Layer

The operational layer is responsible for actually applying the authorized operational change.

P3 tracks that workflow.

P3 does not:

* move people;
* control physical infrastructure itself;
* calculate the operational effect;
* run the sandbox;
* perform optimization.

## 8. Execution Record

Minimum record:

```text
execution_id
strategy_set_id
status
started_at
completed_at
failure_reason
```

## 9. Successful Execution

When the operational layer reports success:

```text
EXECUTING
    ↓
COMPLETED
```

P3 records `completed_at`.

## 10. Failed Execution

When application fails:

```text
EXECUTING
    ↓
FAILED
```

P3 stores a useful failure reason.

The MVP does not automatically retry a failed operational execution.

## 11. Duplicate Protection

The automatic trigger must be idempotent.

If execution is already:

```text
EXECUTING
```

or:

```text
COMPLETED
```

another execution trigger for the same Strategy Set must not create a duplicate operational action.

## 12. No Automatic Retry

The MVP does not automatically retry:

* database failures;
* network failures;
* simulation failures;
* operational execution failures.

This is particularly important for execution because automatic retries could duplicate an operational action.

## 13. Example

```text
Strategy Set 801
      ↓
SIMULATED
      ↓
Coordinator approves
      ↓
APPROVED
      ↓
Automatic execution trigger
      ↓
P5 / Operational Layer
      ↓
EXECUTING
      ↓
Operational action succeeds
      ↓
COMPLETED
```

## 14. Auditability

P3 should make it possible to answer:

* Which Strategy Set was approved?
* Who approved it?
* When was it approved?
* When was execution triggered?
* When did execution start?
* When did it finish?
* Did it fail?
* What was the recorded failure reason?

## 15. Related Documents

* EV-015 — State Machine
* EV-016 — API
* EV-023 — Security
* EV-024 — Error Handling
