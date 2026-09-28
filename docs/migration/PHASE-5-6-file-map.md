# PHASE 5–6 — UI Transplant & Real-Data Wiring (file-by-file)

> Status: **COMPLETE** · Every file accounted for. "Source" = which project's version won and why.

## 1. Files changed in `frontend-ideal/` during the merge

| File | Source of truth | Change made |
|---|---|---|
| `lib/local-store.ts` | **merged** (ideal base + frontend's model) | Added `rateLimits` table, `AccountStatus` (pending/approved/rejected), `iterations` field, and `normalize()` so pre-existing `.eventflow-local/data.json` files are migrated in place (old accounts become approved owners, preserving their behavior). Atomic read-modify-write kept from ideal. |
| `lib/admin.ts` | **merged** (ideal base + frontend's semantics) | Was auth-bypassed (hardcoded LOCAL_USER). Restored ideal's session/scrypt implementation and merged frontend's functional semantics: role model `owner/admin/visitor`, `USER_ID_PATTERN`, `MIN_PASSWORD_LENGTH=12`, per-account `rateLimit()` (8/15min), `revokeUserSessions()` for approval decisions. |
| `app/api/auth/route.ts` | **merged** (ideal structure + frontend contract) | Was missing rate limits/pattern/pending. Now: `sameOrigin`, userId pattern check, 12-char signup password, per-account rate limit, generic login error, **first account bootstraps as owner**, later signups are `pending`, login of `rejected` → 403. |
| `app/api/admin/route.ts` | **frontend's contract, local-store implementation** | Was a stub returning `requests:[]`. Now functional owner endpoint: GET lists non-owner accounts (role/request/requests shape identical to frontend), POST approve/reject with session revocation — exactly frontend's behavior, no D1. |
| `app/page.tsx` | **ideal** | Was unconditional redirect to `/live-map` (auth-bypass). Restored ideal's session-aware redirect (`/live-map` ⇄ `/admin`). |
| `app/admin/page.tsx` | **ideal** | Was `redirect('/live-map')` (admin screen unreachable). Restored `<AdminPanel/>` with `force-dynamic`. |
| `app/admin/panel.tsx` | **merged** (ideal UI + frontend validation) | Kept ideal's complete UI; merged frontend's input constraints (userId `minLength=3 maxLength=64 pattern`, password `minLength=12 maxLength=128`, "At least 12 characters" placeholder) and frontend's post-login behavior for pending accounts (pending → stay on `/admin` with "approval pending" state; approved → `/live-map`). |
| `app/operations-view.tsx` | **ideal** | Restored the "Administrator login" empty-state link that the bypass copy had dropped (byte-identical to ideal again). |
| `tests/api.cjs` | **merged contract** | Updated assertions: stricter validation (400s), owner bootstrap, duplicate 409, `access==='owner'`, pending-account flow (visitor access, approve→admin, reject→access+session revoked), plus all original route/lock/node/restart checks. |

## 2. Files verified identical to ideal (0 whitespace-insensitive diff lines)

`app/globals.css`, `app/map-app.tsx`, `app/event-google-map.tsx`, `app/event-live.tsx`, `app/event-sidebar.tsx`, `app/crowd-inputs.tsx`, `app/theme-provider.tsx`, `app/layout.tsx`, all 5 route pages (`live-map`, `sandbox`, `ai-sandbox`, `updates`, `reports` — each with `requireAdministrator()` guard), all of `components/ui/*`, `hooks/use-mobile.ts`, `lib/map-lock.ts`, `lib/nodes.ts`, `lib/operations.ts`, `lib/orchestrator.ts`, `lib/request.ts`, `lib/utils.ts`, `lib/venue-inputs.ts`, API routes `event`, `geo`, `map-config`, `operations`, `photo`, `snapshot`, `traffic`, `venue-inputs`, `events/[eventId]/[resource]`, `events/[eventId]/nodes/[nodeId]`.

## 3. Real-data wiring (Phase 6 checklist — no mock sources exist; verified)

| Data | Rendered in | Real source (unchanged) |
|---|---|---|
| Event name/city/photo | sidebar city card, headers, ops views | `GET/POST /api/event` (local store + Wikipedia) |
| Map framing/lock | `event-google-map.tsx` | `graph.location` via `/api/events/:id/graph` + `POST location/unlock` |
| Nodes + capacity + status | map markers, `crowd-inputs.tsx` form | `graph.nodes`, `POST/PATCH .../nodes` |
| Edges | map polylines | `graph.edges` (geometry from orchestrator `create_edge`) |
| Live routes | map animated polylines | `graph.routes` (backend/websocket-pushed only) |
| Live crowd counts | node markers/tooltips, admin table | WS `event:<id>:update` pushes + orchestrator `map_snapshot` |
| Alerts | Updates page, map alert box | WS `alertText` + `graph.updates` |
| Incident → analysis → strategies → simulation → approval → delivery | operations-view | `/api/operations` actions → `ORCHESTRATOR_URL` (zod-validated) |
| Admin live place table | `admin/panel.tsx` | `GET /api/snapshot` (orchestrator `map_snapshot`) |
| Search results/photos | `map-app.tsx` | Nominatim `/api/geo`, Wikipedia `/api/photo` |
| Traffic overlay | map | `/api/traffic` (TomTom proxy) |
| Session identity | admin dashboard, `canEdit` | `/api/auth` |
| **Disconnected states** | everywhere | show real connection status ("disconnected", "Unavailable", actionable error) — **no fabricated values anywhere** |

## 4. Loading / error / empty states preserved (ideal's exact UX)

- Admin panel: `Checking your account…` → login tabs / dashboard; snapshot feed `Loading place updates…`, `Waiting for live updates` with the real error, `Out of date — refresh required` after 120s.
- Ops views: `Loading event information…`, `Set up your event` empty state, `No activity yet`, `No approved response yet`, per-action `Working…` busy states, `notice` error banners.
- Map: `notice` messages, map-caption, connection status line (`Live updates: connected|connecting|disconnected`).
