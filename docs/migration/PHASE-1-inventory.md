# PHASE 1 — Project Inventory & Component Mapping

> Status: **COMPLETE** · Date: 2026-09-28
> Purpose: single source of truth for what each project is, so future prompts never re-inspect the codebase.

## 1. What each folder IS

| Folder | Stack | Role | Runs with |
|---|---|---|---|
| `ideal/frontend/` | Next.js 16.3.4 (App Router, webpack), React 19, Tailwind v4, shadcn/radix UI, **local Node/Next server with JSON-file store** (`.eventflow-local/data.json`) | **Visual source of truth.** Working standalone app: local file-based auth/accounts, Google Maps, orchestrator calls. Auth = local sessions in JSON file. | `npm run dev` (port 3000). Setup: `npm run setup` writes `.env.local` |
| `frontend/` | Same app **but ported to Cloudflare vinext/Vite** (vinext 1.0.0-beta.5, wrangler, D1/Drizzle, Cloudflare Workers runtime) | **Functional/runtime source of truth for deployment target.** Same routes/pages as ideal but with: real D1 database auth (PBKDF2 100k iterations, approval workflow, owner bootstrap via OWNER_EMAIL), owner approval of admin accounts, stricter validation (userId regex, 12-char password), rate limiting, `cloudflare:workers` env. | `npm run dev` (vinext, port 5173) |
| `frontend-ideal/` | Next.js 16.3.4 (App Router, webpack) — package.json identical to ideal | **Migration target.** Currently a copy of `ideal/frontend/` with auth disabled ("local development" mode): `lib/admin.ts` returns a hardcoded LOCAL_USER, `app/page.tsx` redirects straight to `/live-map`, `app/admin/page.tsx` redirects to `/live-map` (admin screen unreachable), `app/api/admin/route.ts` stub, no local password hashing. | `npm run dev` (port 3000) |
| repo root | Vite + React + FastAPI (`scripts/dev.mjs`) | P1 crowd engine + P3 backend (separate app; FastAPI on :8000, CORS allows localhost:5173). **Not the UI being migrated** — the UI being migrated is the Next.js EventFlow map app. | `npm run dev` at root |
| `backend/` | FastAPI P3 backend | Serves `/api` for the root Vite app on :8000. The Next.js frontends do NOT call it today (they use their own route handlers + orchestrator). | uvicorn |

**Key finding:** `ideal/frontend` and `frontend` are the SAME application (EventFlow map command center) on two runtimes. All UI source files (components/ui/*, app/*.tsx, globals.css) are **byte-identical modulo CRLF** between ideal and frontend. The real differences are **runtime + persistence + auth**:

## 2. Real (non-CRLF) differences: ideal vs frontend

| File | Difference in `frontend/` (Cloudflare) |
|---|---|
| `lib/admin.ts` | D1/`cloudflare:workers` instead of node:crypto + JSON store. PBKDF2 (100k iter) vs scrypt. `SESSION_COOKIE='__Host-eventflow_session'` (Secure) vs `eventflow_local_session`. `adminIdentity()` queries D1; role can be `owner/admin/visitor` and users can be `pending` (unapproved). Adds `rateLimit()`. |
| `lib/nodes.ts` | Same logic but D1 SQL; `event_keys` table maps route keys → integer event IDs; `RETURNING *` inserts. |
| `lib/operations.ts` | `currentEvent` from D1 `active_event` table; `record`/`records` from `operation_records` table. |
| `lib/orchestrator.ts` | env from `cloudflare:workers`; https-only (no localhost exception). |
| `lib/venue-inputs.ts` | **Legacy visitor inputs REMOVED** in ideal (stub `export {}`); frontend still has D1 `venue_inputs` (placeKey/venueData) — but ideal's `api/venue-inputs/route.ts` returns 410 Gone and its UI has no manual visitor fields. **ideal's removal is newer — keep it.** |
| `app/page.tsx` | ideal: server component, `adminIdentity()` → redirect `/live-map` if logged in else `/admin` (login gate). frontend: renders `<MapApp/>` directly (no auth gate). |
| `app/layout.tsx` | ideal: async, checks `adminIdentity()`, renders EventLive+EventSidebar shell **only when logged in** (login screen renders bare `children`). frontend: always renders the shell. |
| `app/admin/page.tsx` | ideal: renders `<AdminPanel/>`. frontend: redirects to `/live-map` (panel unreachable in Cloudflare build). |
| `app/admin/panel.tsx` | ideal: `auth()` redirects to `/live-map` after login and `/admin` after logout; labels "Home"/"Back to home". frontend: calls `load()` instead of redirect; stricter input constraints (userId pattern, 12-char password min, minLength), "Visitor map" label. |
| `app/event-google-map.tsx` | ideal: **richer lock behavior** — `applySavedLock/zoomWithinLock/pointWithinLock` from `lib/map-lock`, actionable errors (missing key message, 20s timeout), initial `{center:{lat:0,lng:0},zoom:1}`, `fitBounds` fallback when no saved center, panTo clamped to lock. frontend: simpler inline setOptions, no timeout/authFailure handling beyond basic, always sets zoom 12. |
| `app/live-map|sandbox|ai-sandbox|updates|reports/page.tsx` | ideal: `await requireAdministrator()` guard. frontend: none (auth at edge/headers). |
| `app/api/*` | ideal: node runtime, local JSON store, `sameOrigin()` helper from `lib/request`, session cookie logic. frontend: D1, `origin===URL.origin` inline check, rate limits, owner-approval flow in `/api/admin`. |
| `app/chatgpt-auth.ts` | Only in frontend (Cloudflare SIWC helper, unused by UI). |
| `app/api/venue-inputs/route.ts` | ideal: **410 Gone** (manual visitor counts removed). frontend: full D1 CRUD. |
| `app/globals.css`, `components/ui/*`, `app/map-app.tsx`, `event-sidebar.tsx`, `event-live.tsx`, `crowd-inputs.tsx`, `operations-view.tsx`, `theme-provider.tsx` | **IDENTICAL** (0 diff lines whitespace-insensitive). |

## 3. Component mapping (IDEAL → FRONTEND → frontend-ideal TARGET)

| ideal/frontend file | frontend equivalent | frontend-ideal target | Resolution |
|---|---|---|---|
| `app/layout.tsx` (async auth-gated shell) | same, ungated | `app/layout.tsx` | **Auth model decision needed** — see PHASE-3 §5 |
| `app/page.tsx` (redirect based on session) | `<MapApp/>` direct | `app/page.tsx` | prefer ideal's session-aware redirect |
| `app/map-app.tsx` | identical | `app/map-app.tsx` | keep (identical) |
| `app/event-google-map.tsx` (map-lock richer) | simpler variant | `app/event-google-map.tsx` | **prefer ideal** (lock + error UX) |
| `app/event-sidebar.tsx` | identical | keep | keep |
| `app/event-live.tsx` (live provider/websocket) | identical | keep | keep |
| `app/crowd-inputs.tsx` (node editor form) | identical | keep | keep |
| `app/operations-view.tsx` (sandbox/updates/reports views) | identical (except removed "Log in as administrator" empty-state link) | keep ideal version | prefer ideal |
| `app/admin/panel.tsx` (login/signup + live place table + approvals) | stricter validation variant | merge: ideal layout + frontend validation/pending-flow | merge |
| `app/admin/page.tsx` | redirect-only | `app/admin/page.tsx` | prefer ideal (render panel) |
| `app/theme-provider.tsx` | identical | keep | keep |
| `app/globals.css` | identical | keep | keep |
| `components/ui/*` (68 files, shadcn) | identical | keep | keep |
| `hooks/use-mobile.ts` | (none in frontend — vite starter lacks hooks dir) | keep | keep |
| `lib/map-lock.ts` | identical | keep | keep |
| `lib/local-store.ts` | — (D1 instead) | decision: keep local-store (Next.js target) | see PHASE-3 |
| `lib/admin.ts` (local sessions, scrypt) | D1 sessions, PBKDF2+approval | merge | see PHASE-3 |
| `lib/nodes.ts` (JSON store) | D1 | keep ideal | keep ideal |
| `lib/operations.ts` | D1 | keep ideal | keep ideal |
| `lib/orchestrator.ts` (localhost http allowed) | https only | keep ideal | keep ideal |
| `lib/request.ts` (`sameOrigin`) | inline checks | keep ideal | keep ideal |
| `lib/venue-inputs.ts` (stub) | D1 module (unused by UI) | keep ideal stub | keep ideal |
| `app/api/*/route.ts` (12 endpoints) | same paths, D1 impl | keep ideal impls | see PHASE-3 |
| `tests/` (api.cjs, browser.cjs, map-lock.test.mjs) | (frontend has own copies) | keep ideal | keep ideal |
| `scripts/setup-local.mjs` | — | keep | keep |

## 4. Pages & files in ideal/frontend/app (route pages in bold)

| File | Lines | What it is |
|---|---|---|
| **`/` page.tsx** | 6 | redirect: logged-in → `/live-map`, else → `/admin` (login) |
| **`/live-map/page.tsx`** | 3 | `requireAdministrator()` + `<MapApp/>` |
| **`/sandbox/page.tsx`** | 3 | `requireAdministrator()` + `<OperationsView view='sandbox'/>` |
| **`/ai-sandbox/page.tsx`** | 3 | same as sandbox |
| **`/updates/page.tsx`** | 3 | `<OperationsView view='updates'/>` |
| **`/reports/page.tsx`** | 3 | `<OperationsView view='reports'/>` |
| **`/admin/page.tsx` + `panel.tsx`** | 3+ | login/signup tabs, account profile, live place updates table (map_snapshot), owner approval of admin requests |
| `layout.tsx` | 31 | ThemeProvider + fonts; auth-gated EventLive/EventSidebar shell |
| `map-app.tsx` | 23 (dense) | main map screen: search, geolocate, place info, node connect mode, crowd/node form, dark mode |
| `event-google-map.tsx` | 56 | Google Maps loader + markers/polylines + lock behavior |
| `event-live.tsx` | 11 | EventProvider: `/api/event`, graph fetch, WS subscribe, canEdit |
| `event-sidebar.tsx` | 11 | nav: Live Map, AI Sandbox, Updates, Reports + event city card + settings modal |
| `crowd-inputs.tsx` | 9 | node create/edit form (name/type/ref/capacity/status) |
| `operations-view.tsx` | 13 (dense) | incident → analyze → simulate → approve → dispatch flow + reports audit timeline |
| `globals.css` | 167 (dense) | entire design system |

## 5. Tests present in ideal/frontend

- `tests/map-lock.test.mjs` — 5 unit tests (min zoom, zoom in/out, bounds, unlock) via `node --test`
- `tests/api.cjs` — full auth/page-guard/node/lock/restart integration suite (run with `--dev` against a live server)
- `tests/browser.cjs` — Playwright browser regression (mocked Google SDK)

## 6. Environment variables (from code, all optional at runtime)

| Var | Read by | Purpose |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` (or `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, or `.dev.vars`) | `api/map-config`, `setup-local.mjs` | browser map key |
| `ORCHESTRATOR_URL`, `ORCHESTRATOR_TOKEN` | `lib/orchestrator.ts` | AI/orchestrator backend (edges, analyze, simulate, dispatch, snapshot) |
| `EVENTFLOW_WS_URL` | `api/events/[eventId]/[resource]` | live crowd websocket |
| `TOMTOM_API_KEY` | `api/traffic` | traffic tiles |
| `EVENTFLOW_DATA_DIR` | `lib/local-store.ts` | where data.json lives (default `.eventflow-local/`) |
| `PORT` | dev server | Next port (default 3000) |
