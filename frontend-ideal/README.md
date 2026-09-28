# EventFlow: localhost edition

The original EventFlow dashboard and interactive Google Maps implementation are retained.
There is no OpenStreetMap iframe and no Cloudflare, ChatGPT login, or database setup requirement.

## Start in VS Code (Windows, macOS or Linux)

1. Install Node.js 22.13 or newer.
2. Extract the ZIP and open the frontend folder containing package.json.
3. In its terminal run:
   npm install
   npm run setup
4. Open .env.local, created beside package.json, and enter:
   GOOGLE_MAPS_API_KEY=your_actual_key
   (Or put GOOGLE_MAPS_API_KEY in the repository root .env instead and run
   `npm run env:sync` from the root: the same key is then written into this
   file and frontend/.env.local automatically — see the root README.)
5. Run:
   npm run dev
6. Open the localhost URL printed in the terminal.

Do not run page.tsx directly or use VS Code Live Server.
After changing the key, stop the server with Ctrl+C and run npm run dev again.
The old .dev.vars file is also accepted for GOOGLE_MAPS_API_KEY, but .env.local takes priority.
Do not share or commit either file.

Google Maps needs a valid browser key with Maps JavaScript API and billing enabled.
Restrict the key to Maps JavaScript API and your website origins, including
http://localhost:3000/* and http://127.0.0.1:3000/* for the default local port.
The browser map key is necessarily visible to browsers; never put an AI/private service key there.
No real key is included in this ZIP. Missing/invalid keys show an actionable error, not a fake map.

## Administrator accounts and owner approval

When signed out, opening localhost shows the existing login/signup screen without the map or sidebar.
Direct links to Live Map, AI Sandbox, Updates, Reports and Sandbox also require login.
After login, Live Map opens automatically with the existing sidebar.
An already valid signed-in session goes directly to Live Map. Log out to return to the login screen.

The first account created on an empty server becomes the approved owner. Every later signup
is created pending and lands on the Administrator screen with an "approval pending" state;
the owner approves or declines those requests in Administrator (Administrator requests section).
User IDs are 3-64 characters (letters, numbers, dots, underscores, hyphens) and signup
passwords need at least 12 characters. Approval decisions revoke the affected account's sessions.
Passwords are salted and hashed (scrypt). Accounts, sessions and approval state persist across
server restarts. Login attempts are rate limited (8 per account per 15 minutes).
Local information is saved by the Node server in .eventflow-local/data.json.
This is a single-machine development setup, not production authentication.
Do not expose this development server publicly.

## Event map workflow

Choose the event city in Event settings, frame the map and select Save event area.
Only real map bounds, center and zoom are saved, never screenshots or approximate bounds.
Map, Nodes and Routes share one persistent Google map instance.
The saved zoom is the minimum: zoom in freely; zoom out only as far as the saved level.
Pan is restricted to saved bounds. Google Maps' own imagery zoom limits still apply.
Switching phases, themes, traffic or satellite layers does not release the lock.
Refresh and server restart restore the saved framing. Only Unlock & reframe removes the lock.
In Nodes, click the map to create a node; click a saved node to edit it.
Manual visitor count fields are not included.

## AI and live services

Optional .env.local settings: ORCHESTRATOR_URL, ORCHESTRATOR_TOKEN, EVENTFLOW_WS_URL.
Edges call the orchestrator for road/foot geometry and distance; the UI does not calculate them.
AI Sandbox, live routes, alerts, simulations and dispatch require the real backend.
Disconnected services display their actual state; no counts, routes or predictions are fabricated.
Google's traffic layer is separate from EventFlow's live crowd-update websocket.

## Verify

From the repository root, `npm run test` starts this app, waits until it is ready and then
verifies the whole login flow (login page, API, administrator access, rejected unauthorized
access, logout) before running the test suites. That is the intended way to launch this app for
local testing. Inside this folder:

npm test              # map-lock unit tests (node:test)
npm run test:api      # full API/auth contract suite (boots its own dev server)
npm run typecheck
npm run build
npm start

Two local development helpers are used by `npm run test` and can be run on their own:

npm run seed:test-admin    # create/update the idempotent local test administrator
npm run verify:test-env    # check a running server (add --base http://127.0.0.1:3000)

The seed writes the account (default `admin` / `admin123`, override with TEST_ADMIN_USERNAME and
TEST_ADMIN_PASSWORD) into .eventflow-local/ using this app's own account model and scrypt hashing.
It is development-only: it refuses to run when NODE_ENV=production and never logs the password.
That account exists only in the local development store — it does not change or weaken the
authentication and authorization the app always applies.

Optional browser regression tests (Google SDK is mocked, live tiles are not verified):
npx playwright install chromium
npm run test:browser

See VALIDATION.md for the checks performed and limitations.
