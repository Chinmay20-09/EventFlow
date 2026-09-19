    # EV-024 — Error Handling

## 1. Document Purpose

This document defines how P3 responds when requests, data, workflows, databases, simulations, or executions fail.

## 2. Main Principle

P3 must always leave the backend in a known state.

It must not:

- report failure as success;
- store invalid data;
- silently change a requested action;
- bypass the state machine;
- automatically repeat operational execution.

## 3. Standard Error Response

All API errors use:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

## 4. Error Categories

### VALIDATION_ERROR

The request body or parameter is invalid.

Example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request"
  }
}
```

### NOT_FOUND

The requested resource does not exist.

### INVALID_STATE

The requested action is not allowed in the current state.

Example:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Only an approved strategy set can be executed"
  }
}
```

### UNAUTHORIZED / FORBIDDEN

The user is not authenticated or does not have the required role.

### DATABASE_ERROR

P3 cannot complete a database operation.

### INTERNAL_ERROR

An unexpected backend failure occurs.

The API should not expose sensitive internal implementation details.

## 5. Request Validation

Validation happens before important state changes.

Example:

```text
Incoming request
      ↓
Validate
      ↓
Valid ──→ Continue
Invalid → Error response
```

## 6. Not Found

Example:

```text
GET /api/strategy-sets/999999
```

If the Strategy Set does not exist:

```text
NOT_FOUND
```

No fake/default object should be returned.

## 7. Invalid State Transition

Example:

```text
Strategy Set = SIMULATED
Request = Execute
```

P3 rejects the request because approval is required first.

## 8. P1/P2 Data Failure

If a P1/P2 result is structurally invalid:

```text
Receive
 ↓
Validate
 ↓
Invalid
 ↓
Reject
```

P3 does not invent replacement data.

## 9. Database Failure

If PostgreSQL fails:

- return a clear error;
- do not claim success;
- avoid partial workflow updates where transaction handling can prevent them;
- log the technical failure for developers/operators.

## 10. Simulation Failure

Simulation failures follow EV-015.

P3 tracks:

- attempt count;
- failure status;
- latest result;
- failure information.

Maximum attempts:

```text
MAX_SIMULATION_ATTEMPTS=2
```

P3 does not generate a replacement strategy itself.

## 11. Execution Failure

If operational execution fails:

```text
EXECUTING → FAILED
```

P3 stores the failure reason.

## 12. No Automatic Retry

The MVP does not automatically retry:

- database failures;
- network failures;
- simulation failures;
- operational execution failures.

A retry, if appropriate, is initiated through an explicit later action.

This is particularly important for execution because automatic retries could duplicate an operational action.

## 13. Duplicate Execution

If execution is already:

```text
EXECUTING
```

or:

```text
COMPLETED
```

another execute request is rejected.

## 14. Transaction Principle

Where an operation involves multiple related database writes, P3 should use a database transaction so that the workflow is not left half-updated.

Example:

```text
Approval request
   ↓
Create approval record
   ↓
Change Strategy Set state
   ↓
Commit both together
```

If the transaction fails, the database should not present the approval as completed while the Strategy Set remains inconsistent.

## 15. Logging

P3 should log enough technical information for developers to diagnose failures without exposing secrets to API consumers.

Logs should help identify:

- endpoint;
- resource ID;
- error category;
- timestamp;
- technical exception information.

Passwords, tokens, and sensitive credentials must not be logged.

## 16. Related Documents

- EV-015 — State Machine
- EV-016 — API
- EV-022 — Execution Model
- EV-023 — Security
- EV-029 — Configuration

    
