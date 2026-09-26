# P1 → P3 Transport (`integration/transport`)

The runtime connection between the P1 crowd engine (TypeScript, pure
calculation library) and the P3 backend API. P1 stays network-free; these
three modules are the only place where the engine meets HTTP.

## Modules

| File | Responsibility |
|---|---|
| `p3Config.ts` | Env-driven configuration (`P3_BASE_URL`, `P3_API_KEY`, …) — no hard-coded values |
| `p3Client.ts` | Payload construction (P1's own serializers), POSTs, bearer auth, throttle, retry, queueing |
| `p3Queue.ts`  | Temporary local store for payloads that failed delivery (JSONL file or memory) |

## Endpoints and payload mapping (exact, existing P3 schemas)

P3 validates these shapes in `backend/app/schemas/p1.py` (`extra="forbid"`),
built field-for-field by P1's own serializers in `engine/src/serialization.ts`
— no second wire format exists.

### 1. `POST /api/internal/crowd-state` — current crowd snapshot

    { "event_id": <int>,            ← P3-side envelope field (see below)
      "timestamp": <ISO string|null>, ← when P1 measured it (null = server time)
      "metrics": [ serializeMetric(CapacityMetric), … ] }

`serializeMetric` emits exactly the 17 keys P3's `P1CapacityMetric` requires:
`id`, `physical_capacity`, `operational_capacity`, `current_occupancy`,
`inflow`, `outflow`, `utilization`, `queue_size`, `overflow`, `bottleneck`,
`flow`, `holding_utilization`, `service_utilization`, `flow_utilization`,
`overloaded`, `density`, `density_state`.
Nulls stay null, zeros stay zero, P1 string node ids are preserved.

### 2. `POST /api/internal/simulations` — completed simulation result

    { "strategy_set_id": <int>,     ← P3-side envelope field (see below)
      "result": serializeSimulationResult(SimulationResult) }

`serializeSimulationResult` emits the full snake_case result (metrics,
scoped_metrics, final_state, events, timeline, warnings, …) that P3's
`P1SimulationResult` schema mirrors field-for-field. The P1 result `id` is
preserved verbatim and is P3's idempotency key.

## Configuration (environment variables)

| Variable | Meaning | Default |
|---|---|---|
| `P3_BASE_URL` | P3 backend base URL (required) | — |
| `P3_API_KEY` | Shared bearer secret; **empty/unset disables auth** | — |
| `P3_TIMEOUT_MS` | Per-request timeout | `5000` |
| `P3_MAX_ATTEMPTS` | Attempts per request (1 = no retry) | `4` |
| `P3_BACKOFF_BASE_MS` | Exponential backoff base (`base·2^n`, capped) | `200` |
| `P3_BACKOFF_MAX_MS` | Backoff cap | `8000` |
| `P3_CROWD_STATE_MIN_INTERVAL_MS` | Throttle window for live snapshots (latest-wins) | `2000` |
| `P3_QUEUE_BACKEND` | `file` or `memory` | `file` |
| `P3_QUEUE_FILE` | Queue file path | `.p3-queue.jsonl` |

Never commit a real key. The same value must be configured on both sides:
`P3_API_KEY` (P1 transport) ⇄ `P3_API_KEY` (P3 backend, see
`backend/.env.example`).

## Retry and queue behavior

1. Network error/timeout or 5xx → retry up to `P3_MAX_ATTEMPTS` with
   exponential backoff (`base·2^n`, capped).
2. 4xx (invalid payload) → **not** retried; stored once in the local queue
   for inspection/replay.
3. Retries exhausted → payload appended to the local queue (`.p3-queue.jsonl`,
   JSON-lines; torn trailing lines are skipped on read).
4. `P3Client.retryQueued()` (or `npm run push:p3 -- --retry-queue`) replays
   FIFO once P3 recovers; delivered entries are removed, failed stay queued.
5. The client **never throws** — a P3 outage can never stop the P1 engine.

## Meaningful-update boundaries (where sends happen)

- **Crowd state**: after a *meaningful snapshot* is available, at most one
  POST per `P3_CROWD_STATE_MIN_INTERVAL_MS` (latest-wins batching — faster
  snapshots replace the pending one, requirement §8).
- **Simulation results**: after a *completed* `SimulationResult` (whole-run
  boundary, never per internal calculation).

The engine itself (`engine/src/*`) contains no HTTP code and is unchanged.

## Unresolved mappings (documented, never guessed)

P1's output carries **no event identity and no P3 strategy-set identity**
(backend/IMPLEMENTATION_NOTES.md §7, P1_BACKEND_INTEGRATION_REQUIREMENTS §2/§9):

- `event_id` — P3-side envelope field; supplied explicitly per call/config.
  Never inferred.
- `strategy_set_id` — P3-side envelope field; supplied explicitly
  (`--strategy-set-id`). **Never derived from P1's `strategy_id`/`scenario_id`**
  (opaque strings, no established mapping to P3 integer ids).

Runner examples:

    npm run push:p3 -- --scenario normal --strategy-set-id 3
    npm run push:p3 -- --live live.json --event-id 1
    npm run push:p3 -- --retry-queue
