// @vitest-environment jsdom
/**
 * Dashboard shell smoke tests (post-refactor coverage).
 *
 * `src/App.tsx` composes the command center out of focused components
 * (sidebar, header, stats, pages, modals). These tests walk every page and the
 * sandbox → review → approve flow so a component that stops rendering (or is
 * wired to the wrong state) fails loudly instead of silently disappearing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../src/App"
import { clearAccessToken } from "../../src/api"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** Only the endpoints App touches on mount: the health check and the auto-login. */
function stubBackend() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (method === "GET" && url.endsWith("/api/health")) {
        return json({
          success: true,
          data: { status: "ok", environment: "test", max_simulation_attempts: 2 },
        })
      }

      if (method === "POST" && url.endsWith("/api/auth/login")) {
        return json({
          success: true,
          data: {
            access_token: "test-access-token",
            token_type: "bearer",
            user: { user_id: 7, username: "admin", role: "ORGANIZER", email: null },
          },
        })
      }

      return json({ success: false, error: { code: "NOT_FOUND", message: "No route" } }, 404)
    }),
  )
}

beforeEach(() => {
  stubBackend()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearAccessToken()
})

async function renderDashboard() {
  render(<App />)
  await waitFor(() => expect(screen.getByText(/Organizer Command Center/)).toBeTruthy())
}

describe("dashboard shell", () => {
  it("renders the sidebar, header, stats and overview panels", async () => {
    await renderDashboard()

    for (const label of [
      "Overview",
      "Crowd Monitor",
      "Predictions",
      "Sandbox",
      "Strategies",
      "Settings",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy()
    }

    expect(screen.getByText("Live Crowd Map")).toBeTruthy()
    expect(screen.getByText("Predictive Alerts")).toBeTruthy()
    expect(screen.getByText("Event Timeline")).toBeTruthy()
    expect(screen.getByText("Live Visitors")).toBeTruthy()
    expect(screen.getByText(/Test a response before taking action/)).toBeTruthy()
  })

  it("renders each page from the sidebar", async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole("button", { name: "Crowd Monitor" }))
    expect(screen.getByText("Crowd Movement")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Predictions" }))
    expect(screen.getByText("Next 60 Minutes Prediction")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Strategies" }))
    expect(screen.getByText("Available operational responses.")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Settings" }))
    expect(screen.getByText("System Configuration")).toBeTruthy()
    expect(screen.getByText("Auto AI Alerts")).toBeTruthy()
  })
})

describe("sandbox → review → approve flow", () => {
  it("simulates a strategy, reviews it and approves it", async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // "Open Sandbox" appears in the header and in the overview teaser.
    await user.click(screen.getAllByRole("button", { name: "Open Sandbox" })[0])
    expect(screen.getByText("SANDBOX SIMULATION")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /Strategy A/ }))
    expect(screen.getByText("CROWD REDISTRIBUTION")).toBeTruthy()
    expect(screen.getByText("↓ Crowd reduced")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Review Strategy" }))
    expect(screen.getByText("STRATEGY REVIEW")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Approve Strategy" }))
    expect(screen.getByText("Strategy approved")).toBeTruthy()
  })
})
