# P3 Backend — Implementation Notes

## 1. Phase 1 — Verified Starting State (audit performed before any code was written)

### Frontend stack (P4)

| Item | Verified value |
|---|---|
| Branch | `backend` (working tree clean at start; `main` untouched) |
| Framework | React 19.2.8 + TypeScript ~6.0.2 |
| Build tool | Vite 8.3.0 (`@vitejs/plugin-react` 6.1.1) |
| Styling | Tailwind CSS v4 imported in `src/index.css` (`@import "tailwindcss"`), plugin referenced in `vite.config.ts` |
| Routing / state | None (screen switching via `useState` in `src/App.tsx`) |
| HTTP client | None — no axios/fetch anywhere |
| Env usage | None — no `.env`, no `import.meta.env` |
| `package.json` | Runtime deps: `react`, `react-dom` only |
| Lockfile | Present (`package-lock.json`) |

### Backend starting state

**No backend existed.** Repository-wide search found 0 Python files, no `requirements.txt`, no FastAPI code, no Docker files.

### Database starting state

**No database existed.** No `.sql` files, no `.env` / `.env.example`, no Alembic, no ORM code.

### Toolchain verified

- Python 3.11.0, pip 26.1.2 — available.
- `psql` is **not** on PATH; no local PostgreSQL server could be verified on this machine.
- Node.js v26.5.1, npm — available. `npm install` succeeds (0 vulnerabilities).

### Build issue discovered (pre-existing — NOT fixed here)

`npm run build` **fails**, with two pre-existing frontend errors:

```
src/App.tsx(3,7): error TS6133: 'stats' is declared but its value is never read.
vite.config.ts(2,25): error TS2307: Cannot find module '@tailwindcss/vite' or its corresponding type declarations.
```

Verified facts about the second error:

- `@tailwindcss/vite` is **not listed** in `package.json` (dependencies or devDependencies).
- `@tailwindcss/vite` is **not present in `package-lock.json`** (0 matches).
- `@tailwindcss/vite` is **not installed** in `node_modules` after a clean `npm install`.
- Neither is `tailwindcss` itself.

Per the task rules these are **existing frontend dependency issues**; no unrelated frontend fix was performed
and `src/App.tsx` / `vite.config.ts` / `package.json` were left untouched.

## 2. Implementation Assumptions (Phases 2–5)

- **Stack installed in `backend/.venv`**: FastAPI 0.141.1, SQLAlchemy 2.0.54,
  Pydantic 2.13.5, pydantic-settings, psycopg (driver), uvicorn, pytest, httpx.
- **Table bootstrap**: `Base.metadata.create_all` at startup (idempotent).
  No Alembic — migration tooling is not in the allowed dependency list.
- **Lazy engine**: importing the app never opens a connection; the lifespan
  validates `DATABASE_URL` at startup (EV-029 §11).
- **Database target**: production URL is PostgreSQL via `postgresql+psycopg://`
  (a bare `postgresql://` URL is rewritten to the psycopg3 driver).
  **Automated tests run on a temporary SQLite file** (`DATABASE_URL` override in
  `tests/conftest.py`) so the suite runs without a PostgreSQL server.
  PostgreSQL itself was NOT verifiable on this machine (`psql` not installed).
- **Timestamps** are stored as naive UTC (`DateTime` without timezone) so
  PostgreSQL and SQLite behave identically. Input accepts `...Z` values
  (converted to naive UTC); output serializes without the `Z` suffix (same
  instant; EV-037 examples show `Z` strings).
- **Envelope**: `ok()` / `error_response()` in `core/errors.py`; global
  handlers for `AppError`, `RequestValidationError` → `VALIDATION_ERROR` 422,
  `SQLAlchemyError` → `DATABASE_ERROR` 500, unexpected → `INTERNAL_ERROR` 500.
- **HTTP statuses**: 201 for creations, 200 for reads/workflow actions,
  401/403/404/409/422/500 per the documented error codes.
- **CORS**: only `http://localhost:5173` (the P4 dev server).
- **State machine**: the single transition point is `_transition()` in
  `services/workflow.py`; route handlers never write workflow state.
  `ALLOWED_TRANSITIONS` implements EV-015 plus two explicitly documented
  edges: `SIMULATED → SIMULATING` (re-simulation, EV-015 §8) and
  `FAILED → SIMULATING` (permitted retry, EV-015 §11). No `STALE` state.
- **SimulationResult rows**: one per attempt — `strategy_set_id` is indexed but
  **not unique** because `MAX_SIMULATION_ATTEMPTS=2` requires a second result;
  `strategy_sets.simulation_result_id` points to the latest (EV-015 §7
  "latest_result"). `executions.strategy_set_id` remains UNIQUE (one execution
  per set → idempotent trigger, EV-022 §11).
- **Mock adapters** (P1/P2/P5) are clearly marked (`[MOCK ...]` in summaries
  and logs). The mock P1 adapter returns a placeholder summary only — P3
  performs no simulation, prediction, optimization, risk or strategy work.
- **Approval identity**: `ApproveRequest` is an empty schema with
  `extra="forbid"`, so `approved_by` in the body → 422 `VALIDATION_ERROR`.
  Identity comes from the server-resolved Coordinator (EV-023 §4).
- **Approve response** reports `status: "APPROVED"` + `execution_triggered`
  exactly as EV-037 §11. Because the mock P5 trigger runs synchronously, the
  stored status advances to `EXECUTING`, visible via
  `GET /api/strategy-sets/{id}/execution`.
- **Execution completion/failure** (`EXECUTING → COMPLETED/FAILED`) exists as
  service functions only (`complete_execution`, `fail_execution`) — EV-016
  defines no user-facing endpoint for the operational layer to report results
  in the MVP. Tests exercise them directly.
- **Test users**: the fixture seeds 3 users into the fresh test DB — ids
  1=Coordinator, 2=Organizer, 3=Visitor. No user-management endpoints exist
  (not in the Phase 4 endpoint list). Missing identity header → 401
  `UNAUTHORIZED`; wrong role → 403 `FORBIDDEN`.
- **Simulation failure** is reported as `INTERNAL_ERROR` (500) after the set is
  marked `FAILED` and `attempt_count` incremented (EV-024 defines no dedicated
  simulation-failure code). No automatic retry (EV-024 §12).
- **Disruption filters** use the documented query names `?status=` and
  `?type=` (EV-016 §7).
- **File layout**: `app/utils.py`, `app/schemas/common.py`, and per-domain
  model/schema/route modules were added inside the Phase-2 directory layout
  (the tree listed only `__init__.py` placeholders; Phases 3–4 require the
  additional modules). One concern per file, beginner-readable.
- **Endpoint inventory** (verified against the running app's OpenAPI schema):
  exactly the Phase 4 list + `approve`/`reject` from Phase 5 — 18 paths under
  `/api`, no `/api/v1`, no `PATCH`, no `DELETE`, no `/execute`.

## 3. Ambiguities and Pending Decisions

### Resolved with the smallest contract-preserving choice

1. **`predicted_status`** (EV-005 §9) is not in the ingest payload
   (EV-037 §8) → column exists, stored as `NULL`.
2. **`metric`/`predicted_value`** (EV-037 §8) vs **`predicted_crowd`**
   (EV-005 §9) → ingest accepts `metric` (must be `"crowd"`; anything else →
   `VALIDATION_ERROR`) and stores the value verbatim as `predicted_crowd`.
3. **`affected_node_id/affected_edge_id`** singular (EV-005 §8) vs
   **`affected_nodes/affected_edges`** arrays (EV-037 §7) → arrays stored as
   JSON, since EV-037 is the concrete request contract.
4. **`Strategy.status`** is required by EV-005 §11 but EV-015 §2 gives
   individual strategies no lifecycle → column exists with default
   `"PENDING"` (placeholder value).
5. **`simulation_result_id` on Strategy Set** + FK back from SimulationResult
   would be circular → the pointer is a plain integer column with no FK
   constraint on that direction.
6. **Prediction horizon unit** → seconds (per the EV-037 §8 example, 600).
7. **Simulation-failure error code** not defined in EV-024 §4 → used
   `INTERNAL_ERROR` (500) with the set marked `FAILED`.
8. **Read endpoints are unauthenticated** — EV-023 §10 says read permissions
   are not fully specified; only approve/reject are protected in this phase.

### Pending (NOT implemented in Phases 1–5)

- **Authentication mechanism (audit item N7)**: identity currently arrives via
  a development header `X-User-Id` and is resolved server-side against the
  `users` table (role is never client-asserted). EV-023 references an "MVP
  authentication mechanism" that is not specified anywhere in the docs.
  Replacing the header with the real mechanism is an open integration
  decision. No login UI was added.
- **P5 completion reporting**: no documented endpoint exists for
  `EXECUTING → COMPLETED/FAILED`; the service functions are ready but
  unexposed pending a documented route.
- **PostgreSQL verification**: no local PostgreSQL server exists on this
  machine; the PG `DATABASE_URL` path and psycopg driver are configured but
  were not exercised here. A run against a real PostgreSQL instance is still
  required.
- **Audit items N1–N9** remain unimplemented per task rules (Settings entity,
  alerts, activity timeline, crowd flows, P4 aggregate endpoints, etc.).
- **Alembic migrations**: `create_all` is the MVP bootstrap; migration tooling
  is deferred.
- **Pre-existing frontend build failure** (Phase 1): `npm run build` fails on
  (a) `@tailwindcss/vite` missing from `package.json`/lockfile/`node_modules`
  and (b) unused `stats` in `src/App.tsx` — both left untouched per rules.
- **Duplicated approved-toast JSX** in `src/App.tsx` (pre-existing, untouched).

---

## 4. Step 1 — P4 Frontend Data Mapping (re-audit of current `src/App.tsx`)

Re-inspected the current `src/App.tsx` (1,834 lines, unchanged since the Phase 1
audit — `git diff HEAD -- src` is empty). Every piece of frontend data that is
today hardcoded, ternary-driven, random, timer-driven or client-state is mapped
to one of:

**A** = already/exposed by P3 API · **B** = requires a NEW P3 API ·
**C** = must come from P1 · **D** = must come from P2 ·
**E** = purely frontend presentation · **F** = blocked by unresolved decision

| # | Frontend item (current source) | Cat | Backend answer |
|---|---|---|---|
| 1 | `eventName` state ("Mumbai Music Festival", L42) | A/B | `GET/PUT /api/events/{id}/settings` + `GET /api/events/{id}` |
| 2 | Header status badge "LIVE" (hardcoded JSX) | E | Label maps from stored `event.status` (`ACTIVE`) at wiring time |
| 3 | `currentTime` clock (`setInterval` 1 s, L46) | E | Client clock — no backend |
| 4 | Crowd Level stat 78%/68%/73% (`selectedStrategy` ternary) | A/C | `dashboard.crowd_level_pct` = Σ current crowd / Σ capacity (trivial ratio of P1-stored values); simulation overlay = simulation result |
| 5 | Live Visitors 18452 + `Math.random()` every 2 s (L119) | C | `dashboard.live_visitors` = Σ `crowd_state.current_crowd` (values arrive from P1 via `POST /api/internal/crowd`) |
| 6 | Network Capacity 64%/72%/61% ternary (L60–67) | A/C | Transit zone occupancy from `GET /zones` (`transitCapacity` IS the Transit zone value — mapping is frontend presentation) |
| 7 | Risk Level "Medium"/"Low" ternary (stat card) | **F** | No producer exists for *current operational risk* — `dashboard.risk_level` returns `null`; owner (P1 optimization vs P2) undecided → P1 question #24 / unresolved |
| 8 | `stats` const (L3, never rendered) | E | Dead code — documented, untouched |
| 9 | Map zones North 92% / East 54% / Transit 64% ternaries (L48–65) | A/C | `GET /zones` occupancy values from stored crowd + capacity |
| 10 | "Central Zone" map label (no value) | E | Label; its value also comes from `/zones` |
| 11 | "LIVE DATA" / "SIMULATION" badge | E | Frontend flag on `selectedStrategy` |
| 12 | Predictive Alerts list, 3-way ternary `{title,location,level,time}` (L127) | A/B | `GET /api/events/{id}/alerts` — read-time composition of stored disruptions + stored crowd/prediction threshold comparisons (no alerts table, no AI engine) |
| 13 | Notification badge count (`alerts.length`) | B | `dashboard.alert_count` (same read model) |
| 14 | `executionStatus` Ready/Executing/Completed (client state) | A | `GET /api/strategy-sets/{id}/execution` (workflow-owned) |
| 15 | `executionProgress` fake +10 %/s timer (L92) | **F/E** | Progress % has no producer or documented field → frontend timer stays presentation until a P5 progress contract exists (Step 11) |
| 16 | `activityLog` 3 seed entries + client appends (L69) | A/B | `GET /api/events/{id}/timeline` — composed from stored disruptions / simulation results / approvals / executions (no invented entries) |
| 17 | Crowd Monitor zone cards `[{"North Gate","92%","HIGH"}…]` (hardcoded array) | A/B/C | `GET /zones` → `occupancy_pct` (trivial ratio) + `above_threshold` (trivial comparison vs stored settings); the HIGH/NORMAL/STABLE *labels* stay frontend presentation (E) — no documented rule for "STABLE" |
| 18 | Crowd Movement 3 edge flows 85/55/35 % (hardcoded bars) | **C — P1 INPUT REQUIRED** | No edge-flow data exists in P3 and EV-005 forbids P3 crowd tracking → NOT implemented; pending P1 confirmation of a current edge-flow contract |
| 19 | Prediction cards 89/74/58/71 % + delta/label ternaries | A/C | `GET /api/events/{id}/predictions/forecast` from stored P1 predictions (+ capacity ratio for %); empty until P1 ingests |
| 20 | 60-min chart polyline, 6 hardcoded points (L845) | A/C — WAITING FOR P1 | `forecast_points` series storage implemented (nullable JSON on `predictions`) + validated ingest field; values must come from P1 (DRAFT contract, questions #8/#9) |
| 21 | AI Recommendation headline/detail ternary | D | `GET /api/events/{id}/recommendation` → P2 adapter, currently `[MOCK P2]` marked |
| 22 | Strategies page: 2 cards {name, description, risk} hardcoded | D | `GET /api/events/{id}/strategy-sets` extended with optional `name`/`description`/`risk_level` — values stored verbatim from a P2 caller; P3 never generates them |
| 23 | Sandbox "Current Situation" {crowd %, North Gate, network %} | A/C | `dashboard` + `zones` |
| 24 | Sandbox strategy cards {description, risk, crowd 68 %, transit 72 %} | D+A | description/risk = P2-stored set fields; predicted crowd/transit/risk = `simulation_results.predicted_metrics` (P1 output, `[MOCK P1]` until P1 confirms shape) |
| 25 | Simulation Impact current-vs-predicted bars | A | current = crowd state; predicted = `predicted_metrics` |
| 26 | Crowd Redistribution North 68 % → East 68 % block | **C — P1 INPUT REQUIRED** | Zone-level redistribution is simulation output owned by P1 → P1 question #25 (optional field inside `predicted_metrics`, not fabricated by P3) |
| 27 | Strategy Review: Predicted Crowd / Network / Risk | A | `GET /api/strategy-sets/{id}/simulation` → `predicted_metrics` (`[MOCK P1]` values until real P1 confirms) |
| 28 | Approve Strategy button → fake local execution | A | `POST /api/strategy-sets/{id}/approve` (implemented, Coordinator-only) |
| 29 | Settings form: event name, max capacity 50000, threshold 85, auto AI alerts true | A/B | `event_settings` entity + `GET/PUT /api/events/{id}/settings` (conflicts with EV-029 §9 — documented in §3 above and in the EV-029 addendum) |
| 30 | "Save Settings" button (no `onClick` today) | E | Contract exists; wiring is a later P4 task |
| 31 | Open Sandbox / Review / Cancel / nav buttons | E | Pure UI flow |
| 32 | "All systems operational" sidebar dot | E | Static presentation (backend health exists at `/api/health` but frontend wiring not required now) |
| 33 | Unused `stats` const / duplicated toast | E | Dead code — untouched per rules |

### Derived (presentation) values P3 computes — full list (Step 7)

Only trivial ratios/comparisons of **already-stored** inputs; none predict,
optimize, or generate crowd intelligence:

1. `occupancy_pct` = `current_crowd / capacity * 100` (rounded 1 dp) — `null` when `capacity = 0`.
2. `crowd_level_pct` = Σ `current_crowd` / Σ `capacity * 100` over the event's nodes — `null` if no capacity.
3. `live_visitors` = Σ `current_crowd` (sum, not intelligence).
4. `predicted_occupancy_pct` = `predicted_crowd / capacity * 100` (stored P1 value ÷ stored config).
5. `above_threshold` = `occupancy_pct >= alert_threshold` (stored value vs organizer setting).
6. Alert/threshold compositions and timeline messages = factual re-formulation of stored rows (see §5/§6 below).

### Read-model composition rules (Steps 4–5)

**Alerts** (`GET /api/events/{id}/alerts`, newest first, no `alerts` table):

| source | rule | level | time |
|---|---|---|---|
| `disruption` | every `ACTIVE` disruption of the event | stored `severity` verbatim | `created_at` |
| `crowd_threshold` | node where `occupancy_pct >= alert_threshold` | `"HIGH"` (single documented rule: at/above organizer threshold) | crowd `updated_at` |
| `prediction_threshold` | latest stored prediction where `predicted_occupancy_pct >= alert_threshold` **and** settings `auto_ai_alerts = true` | `"HIGH"` | prediction `created_at` |

P3 generates no prediction and no AI alert — it only compares stored P1/P2
values against the organizer's stored threshold (read-time only; nothing
persisted; delete either input and the alert disappears).

**Timeline** (`GET /api/events/{id}/timeline`, newest first, no `activity_log` table):

| stored row | message | `type` (frontend color key) |
|---|---|---|
| disruption created | "Disruption {type} recorded (severity)" | `alert` |
| simulation result created | "Simulation completed for strategy set #{id}" | `warning` |
| approval created | "Strategy set #{id} {approved\|rejected}" | `success` (`alert` when rejected) |
| execution started | "Execution started for strategy set #{id}" | `success` |
| execution completed | "Execution completed for strategy set #{id}" | `success` |
| execution failed | "Execution failed for strategy set #{id}" | `alert` |

Only these stored rows appear — the timeline never invents entries.
