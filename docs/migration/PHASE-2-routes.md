# PHASE 2 — Real Routes (source of truth: both projects share them)

> Status: **COMPLETE** · The route tables of `ideal/frontend/` and `frontend/` are IDENTICAL. `frontend-ideal/` already has the same routes. No route changes needed.

## 1. Route inventory

| Route | Page file | Auth in ideal | Auth in frontend (Cloudflare) | Renders | Real data sources |
|---|---|---|---|---|---|
| `/` | `app/page.tsx` | server redirect: session? → `/live-map` : `/admin` (login) | `<MapApp/>` direct (ungated) | — | — |
| `/live-map` | `app/live-map/page.tsx` | `requireAdministrator()` + `<MapApp/>` | ungated | Map workspace | `GET /api/event`, `GET /api/events/:id/graph`, WS |
| `/sandbox` | `app/sandbox/page.tsx` | guarded + `<OperationsView view='sandbox'/>` | ungated | Incident → AI strategies → simulate → approve flow | `GET/POST /api/operations` |
| `/ai-sandbox` | `app/ai-sandbox/page.tsx` | guarded + `<OperationsView view="sandbox"/>` | ungated | same as `/sandbox` | same |
| `/updates` | `app/updates/page.tsx` | guarded + `<OperationsView view='updates'/>` | ungated | Approved-response dispatch + live alerts | `/api/operations`, graph updates |
| `/reports` | `app/reports/page.tsx` | guarded + `<OperationsView view='reports'/>` | ungated | Audit timeline + JSON export | `/api/operations` records |
| `/admin` | `app/admin/page.tsx` | `<AdminPanel/>` (login/signup screen) | redirect → `/live-map` (unreachable) | Admin auth + live place table + owner approvals | `/api/auth`, `/api/admin`, `/api/snapshot` |

## 2. API route handlers (all identical paths in both projects)

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/auth` | GET, POST | session user / signup / login / logout |
| `/api/admin` | GET, POST | admin role + (frontend) owner approval of pending accounts |
| `/api/event` | GET, POST | current event (name/city/bounds/photo) |
| `/api/events/[eventId]/graph` | GET | location lock, nodes, nodeOptions, edges, live routes, updates, socketUrl |
| `/api/events/[eventId]/location` | POST | save bounds/zoom/center (rejects replace while locked) |
| `/api/events/[eventId]/unlock` | POST | explicit unlock |
| `/api/events/[eventId]/nodes` | POST | create node (server validates, generates node_id) |
| `/api/events/[eventId]/nodes/[nodeId]` | PATCH | partial node update |
| `/api/events/[eventId]/edges` | POST | create edge (forwards to orchestrator `create_edge`) |
| `/api/geo` | GET | Nominatim search + reverse geocode |
| `/api/photo` | GET | Wikipedia geotagged photo |
| `/api/map-config` | GET | Google Maps browser key |
| `/api/operations` | GET, POST | event operation records + AI actions (incident/analyze/simulate/approve/dispatch/refresh) |
| `/api/snapshot` | GET | live place snapshot (orchestrator `map_snapshot`, admin only) |
| `/api/traffic` | GET | TomTom traffic tile proxy |
| `/api/venue-inputs` | GET, POST | ideal: **410 Gone** (removed feature) / frontend: D1 CRUD |

## 3. Route resolution for frontend-ideal

- **Keep every path exactly as-is.** Deep links (`/live-map`, `/sandbox`, `/updates`, `/reports`, `/admin`) must respond without client-side redirect from `/`.
- Auth guard behavior = ideal's: unauthenticated users hitting any dashboard route are redirected to `/admin` (login). This is implemented server-side via `requireAdministrator()` (ideal) — preserved in frontend-ideal.
- Legacy note from frontend/INTEGRATION.md: "`/` and legacy `/sandbox` remain valid" — `/sandbox` still exists in all three projects.
- Navigation between routes is done by `EventSidebar` (`<a href>` full navigation, preserving the shared `EventLive` provider) — identical markup in all projects.

## 4. Auth-gate flow (final target)

```
GET /                → session? redirect /live-map : redirect /admin
GET /live-map        → requireAdministrator() → MapApp
GET /sandbox|/ai-sandbox|/updates|/reports → requireAdministrator() → OperationsView
GET /admin           → AdminPanel (login/signup when logged out; dashboard when in)
layout.tsx           → session ? shell(EventLive+Sidebar+children) : bare children (login page has no sidebar)
```
