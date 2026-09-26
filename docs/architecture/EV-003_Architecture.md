# EV-003 — Architecture

## 1. Document Purpose

This document explains where each major EventFlow component lives, what P3 owns, what P3 does not own, and how the backend fits into the complete MVP.

This is written so that a P3 teammate can understand the backend boundary before implementing FastAPI and PostgreSQL.

## 2. EventFlow Workstreams

EventFlow is divided into five workstreams.

### P1 — Core Engine / Simulation

P1 owns the deterministic event/crowd engine, including:

* unified graph model;
* crowd state and crowd propagation;
* disruption effects within the engine boundary;
* prediction;
* optimization;
* sandbox simulation.

P1 is responsible for the calculations defined by EV-006 through EV-011.

### P2 — AI / Strategy Intelligence

P2 owns:

* mitigation strategy generation;
* natural-language strategy interaction;
* explanations;
* AI-assisted decision support.

P2 does not replace deterministic calculations owned by P1.

### P3 — Backend / Data

P3 owns:

* FastAPI backend;
* PostgreSQL persistence;
* API request validation;
* current backend state;
* Strategy Set workflow/state management;
* approval/rejection tracking;
* execution tracking;
* role-based access to protected actions;
* backend error handling;
* configuration;
* APIs through which P1/P2 provide validated results to the backend.

P3 does not independently decide which strategy is mathematically optimal.

### P4 — Command Center / Web

P4 owns the frontend/command center where the Organizer and Coordinator can view the validated information provided by P3.

P4 is responsible for:

* dashboard;
* event visualization;
* alerts;
* prediction/strategy presentation;
* simulation-result presentation;
* approval/rejection interaction.

P4 consumes P3 APIs rather than directly accessing the PostgreSQL database.

### P5 — Operational / Integration Layer

P5 owns the operational/integration layer responsible for applying an explicitly Coordinator-approved decision.

P5 receives the approved decision from the P3 workflow and performs the operational execution.

## 3. P3's Architectural Role

P3 is the backend/data/state service.

A useful mental model is:

```text
                 P1
        calculations/results
                 │
                 ▼
P2 ───────────► P3
strategies      │
                │
                ├──────────► P4
                │            Command Center
                │                 │
                │                 ▼
                │            Coordinator
                │                 │
                │              Approval
                │                 │
                │                 ▼
                └──────────────► P5
                              Operational
                                Execution
```

P3 is not the mathematical engine.

P3 validates, stores, exposes, and tracks the information required to operate the MVP.

## 4. Important Boundary: P3 Is Not the Full Orchestrator

P3 provides the communication and state infrastructure required by the workflow, but it does not take ownership of P1/P2's internal decision logic.

For example:

```text
P1/P2 calculate / generate
        ↓
   Strategy Set
        ↓
       P3
        ↓
       P4
        ↓
Coordinator reviews simulation
        ↓
Coordinator approves
        ↓
P5 / Operational Layer
        ↓
Execution
```

P3 should not reimplement the P1/P2 calculation chain.

## 5. P4 Frontend Handoff

Validated P3 data and decisions are exposed to P4.

P4 owns the frontend/command center where the Organizer and Coordinator can view the information needed for the MVP workflow.

P3 provides the data through APIs.

P4 must not access PostgreSQL directly.

The important boundary is:

```text
P3
 ↓
Validated data / decisions
 ↓
P4 Command Center
 ↓
Organizer / Coordinator
```

## 6. Decision and Execution Workflow

The locked MVP workflow is:

```text
P1/P2
    ↓
P3
    ↓
P4 Command Center
    ↓
Coordinator reviews simulation
    ↓
Coordinator Approval
    ↓
APPROVED
    ↓
Automatic execution trigger
    ↓
P5 / Operational Layer
    ↓
EXECUTING
    ↓
COMPLETED
```

After explicit Coordinator approval, the system automatically triggers the execution workflow.

This is **not autonomous approval**.

Human Coordinator approval remains mandatory.

There is no separate manual execution request after approval in the MVP.

## 7. Human-in-the-Loop

The MVP requires a human decision before live execution.

The Coordinator is the authorized role for:

* approval;
* rejection.

The system must not approve a Strategy Set automatically.

Once the Coordinator explicitly approves a valid simulated Strategy Set, P3 triggers the P5 execution workflow automatically.

## 8. Storage Boundary

PostgreSQL stores P3-managed persistent information such as:

* events;
* nodes and required edge/connection information;
* current crowd state;
* disruptions;
* predictions;
* Strategy Sets;
* strategies;
* simulation results;
* approvals;
* executions;
* user/role information required by the MVP authentication system.

Rejected/failed Strategy Sets do not require permanent historical storage for the MVP.

Failure handling is still required during the active workflow.

## 9. API Boundary

P3 exposes HTTP/JSON APIs through FastAPI.

The MVP uses:

* `/api/...`;
* controlled workflow actions;
* synchronous request/response;
* standard success/error responses.

P3 exposes validated information to P4 and receives/coordinates the approved execution workflow with P5.

## 10. What P3 Must Never Silently Do

P3 must not:

* invent missing P1 predictions;
* calculate crowd propagation;
* recalculate optimization;
* invent a strategy after a failed simulation;
* automatically approve a Strategy Set;
* execute a Strategy Set without explicit Coordinator approval;
* silently correct invalid workflow states;
* treat simulation state as live operational state.

## 11. MVP Architectural Exclusions

The following are intentionally outside the MVP architecture:

* mandatory microservice decomposition;
* enterprise security architecture;
* massive-scale distributed infrastructure;
* complex event-driven queues for the core workflow;
* separate enterprise identity infrastructure.

These are documented by EV-043 and EV-044 where applicable.

## 12. Implementation Guidance

A P3 developer should be able to implement the backend in this order:

1. configuration;
2. PostgreSQL connection;
3. database models/migrations;
4. FastAPI application;
5. validation schemas;
6. event/node/disruption/state APIs;
7. P1/P2 internal result APIs;
8. Strategy Set workflow;
9. approval/rejection;
10. automatic P5 execution trigger;
11. authentication/role checks;
12. standardized error handling;
13. API tests.

## 13. Related Documents

* EV-005 — Data Model
* EV-015 — State Machine
* EV-016 — API
* EV-020 — External Data
* EV-022 — Execution Model
* EV-023 — Security
* EV-024 — Error Handling
* EV-029 — Configuration
* EV-037 — API Examples
* EV-043 — Microservice Architecture
* EV-044 — Enterprise Security Architecture
