# PHASE 10–11 — Functional Verification & Mock-Data Audit

> Status: **COMPLETE** · Verified against a running dev server (localhost:3000) and via the full API integration suite (dev **and** production builds).

## 1. Route-by-route verification (Phase 10 checklist)

| Route | Loads | UI = ideal | API calls execute | Loading state | Error state | Interaction | Navigation |
|---|---|---|---|---|---|---|---|
| `/` (signed out) | ✅ 307 → `/admin` | ✅ login page, no sidebar/map | — | — | — | — | ✅ |
| `/` (pending user) | ✅ 307 → `/admin` | ✅ | — | — | — | — | ✅ |
| `/` (admin/owner) | ✅ 307 → `/live-map` | ✅ | ✅ | — | — | — | ✅ |
| `/live-map` | ✅ 200 (authed) | ✅ byte-identical component | ✅ event+graph+WS connect | ✅ `notice`/map caption | ✅ honest `disconnected` | ✅ search/nodes/lock | ✅ sidebar nav |
| `/sandbox`, `/ai-sandbox` | ✅ 200 | ✅ | ✅ `/api/operations` | ✅ `Loading event information…` | ✅ ops-note when no orchestrator | ✅ incident form | ✅ |
| `/updates` | ✅ 200 | ✅ | ✅ | ✅ | ✅ `No approved response yet` | ✅ dispatch/refresh | ✅ |
| `/reports` | ✅ 200 | ✅ | ✅ | ✅ | ✅ `No activity yet` | ✅ JSON export | ✅ |
| `/admin` | ✅ 200 (public) | ✅ | ✅ auth/admin/snapshot | ✅ `Checking your account…` | ✅ notice banner | ✅ login/signup/approve | ✅ |

Verified live (curl, 2026-09-28): signup→owner bootstrap→identity→root redirect→event create (Wikipedia photo fetched)→graph (nodeOptions whitelists)→location lock→409 on re-save→node create (server `node_id`)→edge validation error→pending signup→owner approve→session revocation→re-login. All responses matched the documented contracts; no fabricated data appeared in any response.

## 2. Console/health

- Build: clean, no type errors (13 pages + 12 API routes).
- Dev server: boots, no startup errors (`dev-server.log`).
- Disconnected external services (orchestrator, WS, Google key) surface their **real** state:
  - `/api/map-config` → `{"apiKey":null}` → map shows ideal's actionable "Add GOOGLE_MAPS_API_KEY…" error, never a fake map.
  - Edges/analysis/simulation/snapshot without `ORCHESTRATOR_URL` → explicit "AI backend is not connected…" errors.
  - WS without `EVENTFLOW_WS_URL` → `Live updates: disconnected`.

## 3. Mock/demo-data audit (Phase 11)

Searched `frontend-ideal/` app+lib for `mock|mocked|dummy|demo|placeholder|fake|TODO|FIXME`:

| Hit | Location | Verdict |
|---|---|---|
| "No demo figures are substituted." | `operations-view.tsx` UI copy | ✅ intentional honesty note (kept — it *describes* the no-mock policy) |
| "never replaced with fake data" | `.env.local.example` comment | ✅ comment only |
| `test-key-not-real` | `tests/api.cjs` | ✅ test fixture (correct usage) |
| mock Google SDK | `tests/browser.cjs` | ✅ test-only, per ideal's documented test strategy |
| TODO/FIXME | **none** | ✅ |
| Hardcoded crowd/route/capacity numbers | **none** in app/lib | ✅ every value renders from API/WS or shows `Unavailable`/real error |

**Result: zero mock/demo data in the shipped app path.**

## 4. Errors found & fixed during verification (important for future prompts)

1. **Rate-limit inversion** (`app/api/auth/route.ts`): `rateLimit()` returns `true = allowed` (frontend semantics); the route originally 429'd on `true`, blocking every request after the first. Fixed to `if(!rateLimit(...)) 429`. Diagnosed via a standalone probe that diffed HTTP status vs store state (`attempts:1` but 429 → inversion, not exhaustion).
2. **Validation order**: validation must run **before** the limiter so invalid requests don't consume budget (and invalid-format userIds must not create limiter entries).
3. **Pending-user routing**: `page.tsx` (`/`) and `requireAdministrator()` originally treated *any* authenticated user as admin; merged contract sends pending/rejected users to `/admin`. Fixed both + `/api/event` POST guard (now `['owner','admin'].includes(role)`, consistent with every other write route).
4. **Test-helper cookie loss** (`tests/api.cjs`): `requestB` only captured `Set-Cookie` opportunistically; a session issued by signup was dropped when the next response had no cookie. Fixed to capture on every call.
5. **Approval semantics**: approve/reject revoke the target's sessions (frontend parity) → the test logs in again after approval; a rejected account gets 403 on login.
