# Verification results

Passed in the repair environment:
- npm run build: standard Next.js production compilation and TypeScript check.
- npm run typecheck.
- node tests/api.cjs --dev: the full authentication, page-guard, node, lock and restart
  integration suite also passed using the same Next development mode as npm run dev.
- npm test: five map-lock unit tests (minimum zoom, zoom in/out, bounds and unlock).
- npm run test:api against a real running local Next.js server:
  - Logged-out home and all dashboard routes redirect to the login/signup page.
  - Login HTML contains no map, sidebar or dashboard shell.
  - Authenticated home redirects to Live Map; all dashboard pages include the sidebar.
  - Logout restores the route guard; event and graph reads require a session.
  - All six page routes respond successfully.
  - Map configuration reads the configured key.
  - Simple signup with one-character user ID/password succeeds.
  - Duplicate signup and incorrect password are rejected.
  - Session cookies work on localhost without Cloudflare/ChatGPT.
  - Phase 1 saves real bounds, center and zoom; repeat save is blocked while locked.
  - Moving the event city is blocked while its saved frame is locked.
  - Nodes are created and edited with backend-generated IDs.
  - Outside-bounds nodes and forbidden payload fields are rejected.
  - Accounts, sessions, event, framing, nodes and incidents survive server restart.
  - Passwords are stored as salted hashes, not plaintext.
  - Explicit unlock and re-save succeed.
- app/globals.css matches the original EventFlow-All-Changes.zip byte-for-byte.
- No Cloudflare imports or database() calls remain in app/ or lib/.

Not verified:
- Browser automation: Chromium download failed and escalation was unavailable.
  tests/browser.cjs is included for running these checks locally, but was not completed here.
- Live Google tiles, traffic and real gesture behavior: require a valid Google Maps key.
  No real user key was available for this run.
- Real orchestrator and websocket service responses: no service was configured.
- Windows-specific runtime behavior: the code uses cross-platform Node/Next commands,
  but this environment is Linux.

The browser test uses a mock Google SDK to test component wiring and phase lifecycle,
not to certify Google imagery, traffic data, or Google SDK gesture behavior.
No "zero errors on every machine" guarantee is implied by a successful build.

Production use requires a proper authentication policy and shared backend storage.
This edition intentionally provides simple, persistent, single-machine local accounts.
