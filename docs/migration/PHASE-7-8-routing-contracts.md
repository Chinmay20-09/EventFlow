# PHASE 7–8 — Routing Preservation & Backend Contracts

> Status: **COMPLETE** · All frontend/ routes exist in frontend-ideal with identical paths; all backend contracts unchanged.

## 1. Route parity check (frontend/ ⇄ frontend-ideal/)

| Route | frontend/ (vinext) | frontend-ideal/ (Next.js) | Guard |
|---|---|---|---|
| `/` | renders `<MapApp/>` (auth at edge) | session redirect → `/live-map` or `/admin` (ideal behavior) | ✅ |
| `/live-map` | MapApp, ungated | `requireAdministrator()` + MapApp | ✅ |
| `/sandbox` | OperationsView('sandbox') | `requireAdministrator()` + OperationsView('sandbox') | ✅ |
| `/ai-sandbox` | OperationsView("sandbox") | `requireAdministrator()` + OperationsView("sandbox") | ✅ |
| `/updates` | OperationsView('updates') | `requireAdministrator()` + OperationsView('updates') | ✅ |
| `/reports` | OperationsView('reports') | `requireAdministrator()` + OperationsView('reports') | ✅ |
| `/admin` | redirect → `/live-map` (unreachable) | AdminPanel (login/signup/dashboard) | ✅ |
| `/api/*` (12 handlers) | D1-backed | identical paths, local-store-backed, identical request/response JSON | ✅ |

Notes:
- frontend/ gated pages via hosting-platform identity headers; ideal/frontend-ideal gate server-side with `requireAdministrator()` (redirects to `/admin`). Deep links to protected pages without a session land on the login page in all cases.
- Navigation is full-page (`<a href>` + `router.push`) from `event-sidebar.tsx`, preserving the shared `EventLive` provider across route changes. Identical in all three projects.
- Query-param deep links (`/?destinationLat=…`, `/?eventLat=…`) are produced by ideal's components and unchanged.

## 2. Backend contract preservation (no shapes changed)

| Contract | Preserved how |
|---|---|
| `POST /api/auth` `{action,userId,userName,password}` → `{ok,status}` / `{error}` | identical (added server-side validation per frontend's contract; `pending` status returned for non-first signups) |
| `GET /api/auth` → `{user:{userId,userName,role,createdAt},access,status}` | identical |
| `GET /api/admin` → `{role,request,requests[]}` | identical shape (requests now actually populate for the owner) |
| `POST /api/admin` `{action:approve|reject,userId}` → `{ok}` | identical |
| `GET /api/event` → `{event}` / `POST` → `{event}` | untouched (identical file) |
| `GET /api/events/:id/graph` → `{location,nodes,nodeOptions,edges,routes,updates,socketUrl}` | untouched |
| `POST .../location` `{bounds,zoom,center}` (+ 409 while locked) | untouched |
| `POST .../unlock` | untouched |
| `POST .../nodes` → canonical node row with server-generated `node_id` | untouched |
| `PATCH .../nodes/:nodeId` (changed fields only) | untouched |
| `POST .../edges` `{from,to}` → orchestrator `create_edge` | untouched |
| `GET /api/geo`, `/api/photo`, `/api/map-config`, `/api/traffic` | untouched |
| `POST /api/operations` actions `incident/analyze/simulate/approve/dispatch/refresh` | untouched |
| `GET /api/snapshot` (admin-only orchestrator `map_snapshot`) | untouched |
| `GET/POST /api/venue-inputs` → 410 Gone | untouched (feature removed upstream) |
| Orchestrator payloads `analyze_incident`, `simulate_strategy`, `dispatch_approved_response`, `response_status`, `map_snapshot`, `recommend_routes`, `create_edge` | untouched (`lib/orchestrator.ts` + zod schemas) |
| WebSocket `{action:'subscribe',channel:'event:<id>:update'}` push shape | untouched (`event-live.tsx`) |

## 3. Adapter layer

No adapter was needed: the UI and the API contracts already match in both sources (they are the same application). The only shape-level change in frontend-ideal is additive — `/api/admin` GET `requests[]` now contains real pending accounts instead of an empty array, which the existing ideal panel UI already renders.
