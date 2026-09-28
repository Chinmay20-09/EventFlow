# PHASE 3 — Backend Integrations & Mock-Data Audit

> Status: **COMPLETE** · Verdict: **neither project contains mock/demo crowd data.** Every number rendered comes from an API, the orchestrator, the websocket, or Wikipedia/Nominatim. The only "mock" thing in the repo is the root FastAPI P3 adapter (`[MOCK P1]` markers) which is a different app, not this UI.

## 1. Real integrations found (identical in both projects)

| Integration | Where (client) | Where (server) | Contract |
|---|---|---|---|
| **Auth/accounts** | `admin/panel.tsx` → `fetch('/api/auth')` | `app/api/auth/route.ts` + `lib/admin.ts` | signup/login/logout; session cookie; PBKDF2(scrypt in ideal)/PBKDF2(frontend) hashing |
| **Event settings** | `event-sidebar.tsx` (settings modal) | `app/api/event/route.ts` | `{name,city,lat,lon,bounds}`; Wikipedia thumbnail fetched server-side |
| **Graph fetch** | `event-live.tsx` → `GET /api/events/:id/graph` | `app/api/events/[eventId]/[resource]/route.ts` | `{location,nodes,nodeOptions,edges,routes,updates,socketUrl}` |
| **Location lock** | `map-app.tsx` → `POST .../location`, `.../unlock` | same route | bounds/zoom/center; locked areas reject node pins outside bounds |
| **Nodes CRUD** | `crowd-inputs.tsx` → `POST/PATCH .../nodes[/id]` | same + `lib/nodes.ts` | server-generated `node_id`; type/status whitelists; capacity-only (no manual visitor counts) |
| **Edges** | `map-app.tsx` connect-mode → `POST .../edges` | same route | forwards `{action:'create_edge',...}` to **ORCHESTRATOR_URL**; no client-side geometry |
| **Live updates WS** | `event-live.tsx` subscribes `socketUrl` channel `event:<id>:update` | `EVENTFLOW_WS_URL` env | `{nodeId,visitorsNow,updatedRoutes,alertText,updatedAt}` pushes |
| **Route planning** | `map-app.tsx` (dropped-pin directions) | orchestrator `recommend_routes` via `lib/orchestrator.ts` | planSchema-validated; stale >2min rejected; 30s refresh |
| **AI workflow** | `operations-view.tsx` → `/api/operations` actions | `orchestrate({action:'analyze_incident'|'simulate_strategy'|'dispatch_approved_response'|'response_status'})` | zod-validated responses; no fabricated metrics |
| **Live place snapshot** | `admin/panel.tsx` → `GET /api/snapshot` | orchestrator `map_snapshot` | `{updatedAt,message,places[]}` |
| **Search/geocode** | `map-app.tsx` → `/api/geo` | Nominatim (server-side, `countrycodes=in`) | search + reverse |
| **Place photos** | `map-app.tsx` → `/api/photo` | Wikipedia geosearch ≤1km | thumbnail + source link |
| **City photo** | `api/event` POST | Wikipedia pageimages | stored on event |
| **Traffic tiles** | `event-google-map.tsx` overlay → `/api/traffic` | TomTom tile proxy (`TOMTOM_API_KEY`) | 256px flow tiles |
| **Map key** | `event-google-map.tsx` → `/api/map-config` | env `GOOGLE_MAPS_API_KEY` (browser key) | `{apiKey}` |

## 2. Mock/demo-data scan of ideal/frontend (grep results)

| Pattern | Hits | Verdict |
|---|---|---|
| `mock/mocked/dummy/demo/fake/placeholder` | only in README/VALIDATION/test files describing what is NOT done ("No demo crowd counts…", "Google SDK is mocked" in tests) | ✅ none in app/lib code |
| hardcoded crowd numbers | none — counts render `??'Unavailable'` when backend hasn't sent data | ✅ |
| fake endpoints | none — every `/api/*` handler performs real work or returns actionable 4xx/5xx | ✅ |

**Decision:** nothing needs replacing. The frontend's real integrations == ideal's integrations; only the persistence layer differs (D1 vs local JSON store).

## 3. The one real divergence: persistence + auth

- **ideal/** runs on the local Node/Next server: accounts/sessions/event/records/nodes live in `.eventflow-local/data.json` (atomic read-modify-write, `EVENTFLOW_DATA_DIR` override). Signup is open; all accounts are `approved` administrators; scrypt hashing; cookie `eventflow_local_session` (not Secure — fine for localhost).
- **frontend/** runs on Cloudflare Workers: D1 tables `credential_users`, `credential_sessions`, `event_keys`, `active_event`, `operation_records`, `nodes`, `venue_inputs`. Signup creates `pending` accounts that an **owner** approves (`OWNER_EMAIL` bootstrap); PBKDF2-100k; `__Host-` cookie; rate limiting; userId regex `[a-z0-9][a-z0-9._-]{2,63}`; 12-char password minimum.
- **frontend-ideal/** (current state) = ideal's stack with auth *ripped out*: hardcoded `LOCAL_USER` in `lib/admin.ts`, admin page redirects away, `page.tsx` redirects to `/live-map` unconditionally.

## 4. Which auth/persistence should frontend-ideal ship?

Decision matrix (recorded so future prompts don't re-derive it):

| Option | Pro | Con |
|---|---|---|
| A. Keep ideal's local-store auth | works offline, matches ideal UX (open signup), zero infra | diverges from frontend's D1 deployment |
| B. Port frontend's D1 auth to Next.js | matches production | requires D1 emulator (wrangler) under Next — big rewrite, breaks `npm run dev` simplicity |
| **C. Keep ideal's local-store auth, restore its full login/approval-gated flow, adopt frontend's stricter validation rules in the UI where compatible** | preserves ideal UI+UX and functional flow; honors frontend's *security posture* (hashing, same-origin checks) without the Cloudflare runtime | non-Cloudflare persistence |

**Chosen: C** — `frontend-ideal` is a Next.js app (target framework), so Cloudflare-only code (`cloudflare:workers` env, D1) cannot run there. The functional behavior preserved from `frontend/` is its *contract* (same endpoints, same request/response shapes, same validation semantics where runtime-compatible); the persistence implementation is ideal's local store, which `frontend/` itself replaced only because of the Cloudflare port (see `frontend/README.md`: "site-creator-vinext-starter").

## 5. Components of frontend/ functionally preserved in frontend-ideal

1. All API endpoint paths + JSON contracts (identical in both sources).
2. Frontend validation UX from frontend's `admin/panel.tsx`: userId `pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}"`, signup password `minLength={12}`, placeholder "At least 12 characters" — merged into the panel (server enforces equivalents).
3. Origin checking on every mutating endpoint (`sameOrigin()` from ideal's `lib/request.ts` — same semantics as frontend's inline origin check).
4. `rateLimit`-style durable protection is a D1 feature; under the local store a session-expiry sweep + per-request origin check is retained (documented limitation; local dev auth is explicitly not production auth — per ideal README).
