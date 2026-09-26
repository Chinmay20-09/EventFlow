# EventFlow

EventFlow is a crowd-flow decision-support system for large events. It models a venue and its surrounding environment as a graph, simulates how crowds move through it, detects and forecasts congestion, generates candidate mitigation strategies, tests each one in a sandbox, and hands the ranked results to an operator for approval.

Nothing changes in the live environment without an operator approving it.

---

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
UI/
  index.html               Self-contained static prototype (Command Center)
  app.js                   Shared demo state for the multi-page UI version
team.docs                  Document tracker for the full EV-001 … EV-045 set
README.md                  This file
```

---

## Running the prototype

The UI is a plain static prototype. There is no build step, no package manager and no backend.

**Simplest:** open `UI/index.html` in a browser.

**Or serve it locally** (recommended, so relative paths behave the same as in a deployment):

```bash
cd UI
python -m http.server 8000
```

Then open <http://localhost:8000>. Any static file server works the same way.

The prototype has four pages reachable from the sidebar:

| Page | Purpose |
| --- | --- |
| **Live Event Map** | Current venue state, crowd conditions and active disruptions |
| **AI Sandbox** | Run a candidate strategy through a simulated scenario |
| **Response Updates** | Operational status and applied changes |
| **Reports** | Incident response summary |

The sandbox follows the intended production flow: pick a strategy → simulate it → review the simulated outcome → approve or reject. Approving is a UI action only; the prototype does not write to any live system.

> `UI/index.html` is fully self-contained and works on its own. `UI/app.js` holds the shared demo state for a multi-page version of the UI (`live-map.html`, `ai-sandbox.html`, `updates.html`, `reports.html`) that has not been built yet, so it is not currently loaded by `index.html`.

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
- The UI prototype is clickable and demonstrates the strategy → simulate → approve flow.
- Not yet built: backend, database, API, traveler app, and the remaining documents listed in `team.docs`.
