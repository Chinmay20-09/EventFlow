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

## Environment and API keys

The repository root `.env` (git-ignored) is the one place for shared keys and service URLs:

```bash
cp .env.example .env      # then fill in the values you use
npm run env:sync          # copies the shared keys into the frontend
```

`npm run env:sync` writes each shared key into the file the app reads at startup
(`frontend-ideal/.env.local`), so a key such as `GOOGLE_MAPS_API_KEY` only has to be added once:

| Root `.env` key | Where it lands |
| --- | --- |
| `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `frontend-ideal/.env.local` |
| `TOMTOM_API_KEY`, `ORCHESTRATOR_URL`, `ORCHESTRATOR_TOKEN`, `EVENTFLOW_WS_URL` | `frontend-ideal/.env.local` |
| `EVENTFLOW_DATA_DIR` | `frontend-ideal/.env.local` (development only) |

- It also runs automatically at the start of `npm run dev` and `npm run test`, and as `predev`
  for `cd frontend-ideal && npm run dev`.
- Only keys with a real value are copied: an empty or missing key in the root `.env` never
  overwrites a value set in an app's own `.env.local`, and comments and app-specific lines are kept.
  Re-running reports `unchanged`.
- Values are never printed, and all three files are git-ignored (`.env*`) — no key is committed.
- The root Vite app reads the root `.env` directly. Only `VITE_`-prefixed variables reach browser
  code, so keep tokens like `ORCHESTRATOR_TOKEN` unprefixed and server-side.
- To share another key, add its name to `SHARED_KEYS` in `scripts/sync-env.mjs`.

## Testing frontend-ideal (`npm run test`)

`frontend-ideal/` is the Next.js EventFlow app with its own local JSON-store authentication
(scrypt hashes, httpOnly session cookie, owner/administrator roles). From the repository root:

```bash
npm run test
```

That single command:

1. seeds an idempotent **local development administrator** into `frontend-ideal/.eventflow-local/`
   (reusing the app's own account model and password hashing; it refuses to run with `NODE_ENV=production`),
2. starts `frontend-ideal` (dev server) at <http://127.0.0.1:3000> — reusing an already running
   instance instead of racing a second one,
3. waits for real readiness by polling the app (no fixed sleeps),
4. verifies the running application: login page, API routes, the administrator login, admin-area
   access, rejected unauthorized access, rejected wrong password, and logout,
5. runs the existing automated tests (root `vitest` suite, frontend-ideal `node:test` unit tests,
   and the frontend-ideal API integration suite when no dev server is already running),
6. leaves the app running and prints the URL.

```
  URL        http://127.0.0.1:3000
  Login      admin / admin123   (local development only)
  Stop it    npm run test:stop
```

`admin / admin123` exists **only** in the local development store created by the seed. Production
authentication is unchanged: no credentials are hardcoded in application code, no authorization
check is weakened, and the seed refuses to run in production. Override the credentials for a run
with `TEST_ADMIN_USERNAME` / `TEST_ADMIN_PASSWORD`.

| Command | What it does |
| --- | --- |
| `npm run test` | launch + verify frontend-ideal, run every existing test suite, keep the app running |
| `npm run test -- --fast` | same, but skip the frontend-ideal API integration suite |
| `npm run test -- --foreground` | run the dev server in the foreground (Ctrl+C stops it) |
| `npm run test -- --restart` | restart the dev server instead of reusing a running one |
| `npm run test:stop` | stop the dev server that `npm run test` started |
| `npm run test:unit` | only the root Vitest suite (Vite command center + engine) |

The app's own suites stay available: `cd frontend-ideal && npm test` (map-lock unit tests) and
`npm run test:api` (full API/auth contract suite).

Note: the API integration suite starts its own dev server for `frontend-ideal/`, and Next.js allows only
one dev server per directory. `npm run test` therefore runs it *before* the app it keeps running, and
skips it (with a message) when a dev server for the app is already running — use `npm run test:stop`
first if you want it included in that situation. If the verification ever finds the dev server dead
(for example a stale dev build left by another server), `npm run test` clears the dev build, restarts
the app and verifies once more automatically, then reports the error if it still fails.

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
src/                       Vite/React command center (weather digital twin)
frontend-ideal/            Next.js EventFlow app (the final frontend)
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
