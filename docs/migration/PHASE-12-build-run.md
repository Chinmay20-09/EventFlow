# PHASE 12 — Build & Run

> Status: **COMPLETE** · Node v24.14.0, Windows (bash). All commands run inside `frontend-ideal/`.

## 1. Commands & results

| Command | Result |
|---|---|
| `npm install` | not needed — `node_modules` already intact (same lockfile as ideal) |
| `npm run typecheck` | ✅ **0 errors** (`tsc --noEmit`) |
| `npm run lint` | 137 errors / 14 warnings — **pre-existing style**, byte-identical source in ideal (122× `no-explicit-any` from the dense code style, `react-hooks/set-state-in-effect`, next `<a>` vs `<Link>`, etc.). Left as-is to keep files byte-identical with the visual source of truth. Only 2 lint findings were introduced by the merge (unused vars) — both fixed. |
| `npm test` | ✅ **5/5 pass** (map-lock unit tests) |
| `npm run build` | ✅ succeeds — 13 pages + 12 API routes compiled, all server-rendered |
| `npm run test:api` | ✅ **8 PASS blocks + "All API integration checks passed."** — in production mode (after `npm run build`) and re-verified in dev mode (`node tests/api.cjs --dev`) after every source change |
| `npm run dev` | ✅ boots clean on **http://localhost:3000** (`dev-server.log`) |

## 2. Startup & connectivity evidence

- `npm run dev` → server ready, no startup errors.
- `GET /` unsigned → 307 `/admin`; `/admin` → 200; protected routes unsigned → 307 `/admin`.
- `GET /api/map-config` → `{"apiKey":null}` (no key configured locally — honest empty state; set `GOOGLE_MAPS_API_KEY` in `.env.local` to activate the map).
- Full user journey via curl: signup (owner bootstrap) → identity (`access:"owner"`) → event create (Wikipedia photo fetched server-side) → graph with nodeOptions → location lock (409 on re-save) → node create (`node_id` server-generated) → edge without orchestrator → explicit validation error (no fabricated geometry) → pending signup → owner approve → target session revoked → re-login works.

## 3. Running both ends

```bash
cd frontend-ideal
npm run dev          # UI + API route handlers on :3000
```

External services (optional, per INTEGRATION.md): `ORCHESTRATOR_URL`/`ORCHESTRATOR_TOKEN` (AI/edges/routes/snapshot), `EVENTFLOW_WS_URL` (live updates), `GOOGLE_MAPS_API_KEY` (map tiles), `TOMTOM_API_KEY` (traffic tiles). The FastAPI P3 backend at the repo root is a separate application; this Next.js frontend integrates the orchestrator contract (see PHASE-3 §1) and never needs the Python process to demonstrate honest disconnected states.

## 4. Known environment notes

- Next.js warns "multiple lockfiles detected" (repo root + frontend-ideal) and picks the repo root for output tracing — harmless for dev/build; silence with `outputFileTracingRoot` in `next.config.ts` if desired.
- Windows console: kill the dev server with Ctrl+C in its terminal.
