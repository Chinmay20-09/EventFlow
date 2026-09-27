# EventFlow

EventFlow is a crowd-flow decision-support system for large events. It models a venue and its surrounding environment as a graph, simulates how crowds move through it, detects and forecasts congestion, generates candidate mitigation strategies, tests each one in a sandbox, and hands the ranked results to an operator for approval.

Nothing changes in the live environment without an operator approving it.

---

## Running locally

From the repository root, run:

```bash
npm install
npm run dev
```

This starts the Vite frontend at <http://localhost:5173> and the FastAPI backend at <http://localhost:8000>. Frontend requests to `/api` are proxied to the backend. The login screen checks backend health and authenticates through the backend API.

The backend requires `backend/.venv` with `backend/requirements.txt` installed and a configured `backend/.env` (copy `backend/.env.example` and set `DATABASE_URL` to a reachable PostgreSQL database). Set `API_PORT` before `npm run dev` to use a different backend port; the Vite proxy follows that setting.

## The core workflow

```
Graph  →  Crowd  →  Disruption  →  Prediction  →  Optimization
                                                       ↓
                                                   Simulation
                                                       ↓
                                                  Optimization
                                                       ↓
                                      Operator approval → Live state
```

Each stage has exactly one owner and one job:

| Stage | Question it answers |
| --- | --- |
| **Graph** | What exists, where, and what is its configured capacity? |
| **Crowd** | Where are people now, and what are the current crowd metrics? |
| **Disruption** | What operational condition changed, and what does it affect? |
| **Prediction** | What is likely to happen next? |
| **Optimization** | What could we change, and what would happen if we changed it? |
| **Simulation** | What actually happens if we execute this scenario? |
| **Operator** | Do we apply this change to the live environment? |

A feedback loop from Simulation back into Optimization is intentional: candidate strategies are evaluated in the sandbox, and Optimization ranks them using the measured outcomes.

---

## Repository layout

```
docs/                     Domain specifications (the architecture)
  EV-006Graph_model.md     EV-006  Graph Model
  EV-007_Crowd_Model.md    EV-007  Crowd Model
  Disruption_model.md      EV-008  Disruption Model
  Prediction.md            EV-009  Prediction
  EV-010_Optimization.md   EV-010  Optimization
  EV-011_Simulation.md      EV-011  Simulation
frontend/src/              Vite/React command center
backend/app/               FastAPI API and persistence layer
team.docs                  Document tracker for the full EV-001 … EV-045 set
README.md                  This file
```

---

---

## Documentation

The `docs/` folder holds the architecture. These six specifications are written and internally consistent; they are the source of truth for behaviour, field names and units.

| Document | What it defines |
| --- | --- |
| [`EV-006Graph_model.md`](docs/engine/EV-006Graph_model.md) | Nodes, directed edges, capacity, traversal and operational state |
| [`EV-007_Crowd_Model.md`](docs/engine/EV-007_Crowd_Model.md) | Crowd groups, movement, accumulation, utilization, density and overload |
| [`EV-008_Disruption_model.md`](docs/engine/EV-008_Disruption_model.md) | Disruption types, severity, lifecycle and declared operational effects |
| [`EV-009_Prediction.md`](docs/engine/EV-009_Prediction.md) | Forecast targets, horizon, confidence, staleness and failure handling |
| [`EV-010_Optimization.md`](docs/engine/EV-010_Optimization.md) | Decision variables, constraints, objectives, ranking and approval handoff |
| [`EV-011_Simulation.md`](docs/engine/EV-011_Simulation.md) | Sandbox scenarios, isolated state, metrics and strategy comparison |

[`team.docs`](team.docs) tracks the full document set (EV-001 … EV-045) with each document's purpose, summary, priority and status.

---

## Key concepts

A few terms that mean something specific in this project:

| Term | Meaning |
| --- | --- |
| **Node capacity** | How many people a location can hold. Unit: **people**. |
| **Node `throughput_capacity`** | How fast a location can serve people. Unit: **people/minute**. |
| **Edge capacity** | How much flow a connection can carry. Unit: **people/minute**. |
| **Initial Graph** | The locked pre-event baseline. Never modified. |
| **Current Graph** | The latest *authorized* operational configuration. |
| **Disruption severity** | How serious a disruption is. Never converted into a crowd metric, capacity, probability or score. |
| **Strategy** | A bounded, proposed set of parameter changes. It is not applied until an operator approves it. |

---

## Current status

- Six domain specifications (EV-006 … EV-011) are complete and reviewed for cross-document consistency.
- The root Vite/React command center and FastAPI backend are available through `npm run dev`.
- The backend requires a reachable PostgreSQL database configured in `backend/.env`; the traveler app and remaining documents in `team.docs` are not complete.
