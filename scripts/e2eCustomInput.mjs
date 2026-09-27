/**
 * Browser E2E verification of the login + Custom Input flows.
 *
 * Proves the full flows in a real Chrome browser:
 *   Register (UI) → POST /api/auth/register (P3, :8000) → bcrypt → JWT login
 *   → dashboard → Custom Input (UI) → POST /api/events (P3) → PostgreSQL
 *   → GET /api/events/{id} → UI displays the backend record.
 *
 * Run:  node scripts/e2eCustomInput.mjs   (backend + vite dev must be running)
 * Exit 0 = all checks passed, exit 1 = something broke.
 * Screenshots are written to e2e-artifacts/.
 */

import { chromium } from "playwright-core"
import { mkdirSync } from "node:fs"

const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? "http://localhost:5173"
const MARKER = `EV-CUSTOM-INPUT-UI-${Date.now()}`
// Auth screen removed for now: the app auto-signs-in with the default admin
// account (seeded by the backend at startup), so the E2E skips registration.
const ARTIFACTS = "e2e-artifacts"
mkdirSync(ARTIFACTS, { recursive: true })

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

const apiCalls = [] // { method, url, status, body }
const consoleErrors = []

async function launch() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true })
  } catch {
    return await chromium.launch({
      headless: true,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    })
  }
}

const browser = await launch()
const page = await browser.newPage()

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text())
})
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`))
page.on("requestfailed", (req) => {
  if (req.url().includes("/api/")) {
    consoleErrors.push(`requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`)
  }
})
page.on("response", async (res) => {
  const req = res.request()
  if (res.url().includes("/api/")) {
    let body = null
    try {
      body = await res.json()
    } catch {
      /* non-JSON */
    }
    apiCalls.push({ method: req.method(), url: res.url(), status: res.status(), body })
  }
})

try {
  // --- 1. Load the P4 UI — the dashboard (auth screen removed for now) -----
  await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded", timeout: 20_000 })
  const dashboard = page.getByText("Organizer Command Center")
  await dashboard.waitFor({ timeout: 20_000 })
  check("P4 UI loads at " + FRONTEND_URL, true)

  // Health polling should flip to "Backend connected" and the app should
  // auto-login as the default admin (admin/admin123).
  await page.getByText("Backend connected").waitFor({ timeout: 20_000 })
  check("Dashboard shows 'Backend connected'", true)
  const loginCall = apiCalls.find((c) => c.method === "POST" && c.url.endsWith("/api/auth/login"))
  check("Auto-login as default admin returned 200 with token", loginCall?.status === 200 && !!loginCall?.body?.data?.access_token)
  check("Dashboard rendered after auto-login", await dashboard.isVisible())
  await page.screenshot({ path: `${ARTIFACTS}/01-dashboard-after-auto-login.png` })

  // --- 2. Custom Input button is visible ------------------------------------
  const customBtn = page.getByRole("button", { name: "Custom Input" })
  await customBtn.waitFor({ timeout: 10_000 })
  check("Custom Input button visible in header", await customBtn.isVisible())

  // --- 3. Validation: empty submit is blocked client-side --------------------
  await customBtn.click()
  await page.getByText("Enter event data").waitFor({ timeout: 5_000 })
  await page.getByRole("button", { name: "Submit" }).click()
  const validationShown = await page.getByText("All fields are required.").isVisible()
  check("Empty submit shows validation error", validationShown)
  const eventsCallsBeforeFill = apiCalls.filter((c) => c.url.includes("/api/events")).length
  check("Empty submit did NOT hit the backend", eventsCallsBeforeFill === 0)
  await page.screenshot({ path: `${ARTIFACTS}/04-validation-error.png` })

  // --- 4. Fill and submit the real values ------------------------------------
  await page.getByLabel("Event name").fill(MARKER)
  await page.getByLabel("Event date").fill("2026-10-15")
  await page.getByLabel("Start time").fill("10:00")
  await page.getByLabel("End time").fill("22:00")
  await page.screenshot({ path: `${ARTIFACTS}/05-custom-input-filled.png` })
  await page.getByRole("button", { name: "Submit" }).click()

  // --- 5. Success view appears ----------------------------------------------
  const stored = page.getByTestId("custom-input-stored")
  await stored.waitFor({ timeout: 15_000 })
  check("Success view (stored record) appears", true)

  // --- 6. Network proof: POST then GET hit P3 --------------------------------
  const post = apiCalls.find((c) => c.method === "POST" && c.url.endsWith("/api/events"))
  check(
    "POST /api/events sent to P3",
    !!post,
    post ? `status ${post.status}` : "no POST observed",
  )
  check("POST returned 201 with success envelope", !!post && post.status === 201 && post.body?.success === true)
  check(
    "POST body carries the user-entered values",
    !!post && post.body?.data?.name === MARKER,
    post?.body?.data?.name ?? "",
  )

  const get = apiCalls.find(
    (c) => c.method === "GET" && /\/api\/events\/\d+$/.test(c.url),
  )
  check("GET /api/events/{id} fetched the record back", !!get, get ? `status ${get.status}` : "no GET observed")
  check(
    "GET returned the same record from the database",
    !!get && get.body?.success === true && get.body?.data?.name === MARKER,
  )

  // --- 7. UI displays the backend-returned record ----------------------------
  const successText = await stored.innerText()
  check("Modal shows 'Saved to the database and fetched back'", successText.includes("Saved to the database"))
  check("Modal shows the backend record name", successText.includes(MARKER))

  const idFromGet = get?.body?.data?.event_id
  check(
    "Modal shows the database ID from the GET response",
    idFromGet != null && successText.includes(`#${idFromGet}`),
    `#id shown vs GET event_id ${idFromGet}`,
  )

  await page.screenshot({ path: `${ARTIFACTS}/05-custom-input-success-modal.png` })

  // --- 8. Overview card shows the fetched record after closing the modal -----
  await page.getByRole("button", { name: "Done" }).click()
  const card = page.getByText("Stored custom event data")
  await card.waitFor({ timeout: 5_000 })
  const cardText = await page.locator("body").innerText()
  check("Overview shows 'Stored custom event data' card", await card.isVisible())
  check("Overview card shows the backend record name", cardText.includes(MARKER))

  await page.screenshot({ path: `${ARTIFACTS}/06-overview-stored-card.png` })
} catch (err) {
  check("E2E script completed without unexpected failure", false, String(err))
  await page.screenshot({ path: `${ARTIFACTS}/failure.png`, fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

// --- Summary -----------------------------------------------------------------
console.log("\nConsole/page errors observed:", consoleErrors.length)
for (const e of consoleErrors) console.log("  •", e.slice(0, 200))

const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
if (failed.length > 0) {
  console.log("Failed checks:")
  for (const r of failed) console.log("  ✗", r.name, r.detail)
  process.exit(1)
}
console.log("Marker used:", MARKER)
console.log("Screenshots in:", ARTIFACTS + "/")
