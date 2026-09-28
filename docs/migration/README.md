# EventFlow Frontend Migration — Documentation Index

> **Read this first.** This folder documents the completed migration that produced `frontend-ideal/`.
> It exists so that any future prompt/agent can answer "where is X and why is it like that"
> **without re-reading the codebase**.

## One-paragraph summary

`ideal/frontend/` (Next.js 16, perfect UI, local JSON-store auth) and `frontend/` (same app ported
to Cloudflare vinext, D1 database, stricter auth + owner-approval workflow) are the **same
application** — their UI files are byte-identical modulo line endings. `frontend-ideal/` is the
merged production frontend: **ideal's UI/UX** + **frontend's functional auth semantics and API
contracts**, running on Node/Next.js. No mock data exists anywhere in the app path; every value
renders from the API/websocket/orchestrator or shows an honest disconnected/unavailable state.

## The documents, by question

| I need to know… | Read | Key facts |
|---|---|---|
| What each folder is; full component mapping | [PHASE-1-inventory.md](PHASE-1-inventory.md) | ideal=visual truth, frontend=Cloudflare variant, frontend-ideal=target; file-by-file mapping table; env vars table |
| Which routes exist and their guards | [PHASE-2-routes.md](PHASE-2-routes.md) | 7 page routes + 12 API endpoints; auth-gate flow diagram; all three projects share the same route table |
| What backend integrations exist; is there mock data; why auth works the way it does | [PHASE-3-backend-integrations.md](PHASE-3-backend-integrations.md) | 15 real integrations catalogued; **zero mock data found**; decision matrix → merged auth (option C) |
| What the target architecture is | [PHASE-4-architecture.md](PHASE-4-architecture.md) | Next.js App Router layout, layering rules, what was deliberately NOT copied (Cloudflare/D1/chatgpt-auth) |
| Which files the merge changed and why | [PHASE-5-6-file-map.md](PHASE-5-6-file-map.md) | 9 files changed (with source-of-truth rationale), everything else verified identical; real-data wiring checklist; loading/error/empty states |
| Are routes and backend contracts preserved | [PHASE-7-8-routing-contracts.md](PHASE-7-8-routing-contracts.md) | route parity table; contract-by-contract preservation table; no adapter needed |
| What design system is used | [PHASE-9-design-system.md](PHASE-9-design-system.md) | Tailwind v4 + shadcn/radix + lucide + next-themes; identical in all three; no conflicts |
| Was it verified; were there bugs | [PHASE-10-11-verification.md](PHASE-10-11-verification.md) | route-by-route checklist; live curl evidence; mock-scan results; **5 bugs found & fixed during verification** |
| How do I build/run/test it | [PHASE-12-build-run.md](PHASE-12-build-run.md) | typecheck 0 errors · build ✅ · unit 5/5 · API suite 8 PASS blocks · dev on :3000; lint debt explained |
| What's the final state and what remains | [PHASE-13-audit.md](PHASE-13-audit.md) | ideal vs target: no visual deltas; frontend vs target: contracts preserved, persistence differs intentionally; 5 honest remaining issues |

## Quick reference for future changes

- **Run it:** `cd frontend-ideal && npm run dev` → http://localhost:3000
- **Check it:** `npm run typecheck && npm test && npm run build && npm run test:api` (production API suite needs `npm run build` first; dev mode: `node tests/api.cjs --dev`)
- **First login:** first account signed up on an empty store becomes **owner**; later signups are pending until the owner approves them in `/admin`.
- **Env vars** (`.env.local`): `GOOGLE_MAPS_API_KEY`, `ORCHESTRATOR_URL`, `ORCHESTRATOR_TOKEN`, `EVENTFLOW_WS_URL`, `TOMTOM_API_KEY`, optional `EVENTFLOW_DATA_DIR`.
- **Data location:** `.eventflow-local/data.json` (atomic writes; auto-migrates old files).
- **Add a prompt-friendly rule:** if a request conflicts with ideal → prefer ideal for UI; prefer frontend-ideal's merged contract (documented in PHASE-3 §4/§5 and PHASE-7-8) for behavior.

## Files changed during the merge (complete list)

`lib/local-store.ts`, `lib/admin.ts`, `app/api/auth/route.ts`, `app/api/admin/route.ts`,
`app/api/event/route.ts`, `app/page.tsx`, `app/admin/page.tsx`, `app/admin/panel.tsx`,
`app/operations-view.tsx` (restored from ideal), `tests/api.cjs`, `README.md`, `INTEGRATION.md`.
Everything else is verified identical to `ideal/frontend/` — see
[PHASE-5-6-file-map.md](PHASE-5-6-file-map.md) before touching any of them.
