# PHASE 4 — frontend-ideal Architecture

> Status: **COMPLETE** · The target framework is Next.js 16 App Router (matches both sources). The structure below is what `frontend-ideal/` already has (it follows Next conventions rather than the generic `routes/pages/components` layout — correct per instructions "adjust to the framework's convention").

## 1. Final directory layout

```
frontend-ideal/
├── app/                    # Next.js App Router (routes + UI + API handlers)
│   ├── layout.tsx          # root: fonts, theme provider, session-gated app shell
│   ├── page.tsx            # / : session-aware redirect (→/live-map or →/admin)
│   ├── globals.css         # entire design system (Tailwind v4 + custom classes)
│   ├── map-app.tsx         # live-map workspace (client)
│   ├── event-google-map.tsx# Google Maps facade + lock + overlays
│   ├── event-live.tsx      # EventProvider: event/graph/WS context
│   ├── event-sidebar.tsx   # nav + event settings modal
│   ├── crowd-inputs.tsx    # node create/edit form
│   ├── operations-view.tsx # sandbox/updates/reports views
│   ├── theme-provider.tsx
│   ├── admin/page.tsx      # /admin → AdminPanel
│   ├── admin/panel.tsx     # auth tabs + account + snapshot + approvals
│   ├── live-map/page.tsx   # /live-map → MapApp (guarded)
│   ├── sandbox/page.tsx    # /sandbox → OperationsView('sandbox') (guarded)
│   ├── ai-sandbox/page.tsx # /ai-sandbox → OperationsView('sandbox') (guarded)
│   ├── updates/page.tsx    # /updates → OperationsView('updates') (guarded)
│   ├── reports/page.tsx    # /reports → OperationsView('reports') (guarded)
│   └── api/                # route handlers (real backend contracts, no mocks)
│       ├── auth/route.ts
│       ├── admin/route.ts
│       ├── event/route.ts
│       ├── geo/route.ts · photo · map-config · snapshot · traffic
│       ├── operations/route.ts
│       ├── venue-inputs/route.ts        # 410 Gone (feature removed upstream)
│       └── events/[eventId]/
│           ├── [resource]/route.ts      # graph GET + location/unlock/edges POST
│           └── nodes/[nodeId]/route.ts  # node PATCH
├── components/ui/          # shadcn/ui primitives (68 files)
├── hooks/use-mobile.ts
├── lib/                    # server-side domain logic
│   ├── admin.ts            # sessions, hashing, identity (local store)
│   ├── local-store.ts      # atomic JSON persistence (.eventflow-local/data.json)
│   ├── nodes.ts            # node validation + persistence
│   ├── operations.ts       # event + operation records
│   ├── orchestrator.ts     # ORCHESTRATOR_URL client + zod schemas
│   ├── request.ts          # sameOrigin() helper
│   ├── map-lock.ts         # pure lock math (shared with tests)
│   ├── utils.ts · venue-inputs.ts
├── lib/nodes.ts            # ↑ (listed above)
├── tests/                  # map-lock.test.mjs, api.cjs, browser.cjs
├── scripts/setup-local.mjs # writes .env.local template
├── public/                 # static assets
└── package.json            # name "eventflow-local", next dev --webpack
```

## 2. Layering rules (what imports what)

```
page.tsx (server) ──▶ lib/admin.ts ──▶ lib/local-store.ts
client components ──▶ /api/* route handlers ──▶ lib/* ──▶ external services (Google, Nominatim, Wikipedia, TomTom, orchestrator, WS)
event-live.tsx (client context) ◀── map-app.tsx, crowd-inputs.tsx, operations-view.tsx, event-sidebar.tsx
```

- Client components never import `lib/` server modules (except type-free pure helpers like `map-lock`, which is safe and tested).
- All external-service calls happen server-side in route handlers.
- No client-side route/path/distance/crowd calculation anywhere (contract inherited from both sources).

## 3. What was deliberately NOT copied

| From | Not copied | Why |
|---|---|---|
| frontend/ | `cloudflare-env.d.ts`, `wrangler`/D1/Drizzle, `.sites-runtime`, `vite.config.ts`, vinext, `chatgpt-auth.ts`, `db/` | Cloudflare-only; target runs on Node/Next |
| frontend/ | `lib/venue-inputs.ts` D1 implementation | feature removed upstream (ideal returns 410; UI has no visitor fields) |
| ideal/ | nothing | ideal is the base |

## 4. Scripts

| Script | Command |
|---|---|
| dev | `npm run dev` (next dev --webpack, port 3000) |
| build | `npm run build` (next build --webpack) |
| typecheck | `npm run typecheck` (tsc --noEmit) |
| lint | `npm run lint` (eslint app lib hooks components) |
| unit tests | `npm test` (node --test tests/map-lock.test.mjs) |
| api tests | `npm run test:api` (boots dev server; full auth/node/lock suite) |
| browser tests | `npm run test:browser` (Playwright, mocked Google SDK) |
| setup | `npm run setup` (writes `.env.local`) |
