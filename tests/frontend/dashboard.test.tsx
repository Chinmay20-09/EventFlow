// @vitest-environment jsdom
/**
 * Dashboard shell tests.
 *
 * `src/App.tsx` composes the command center out of focused components
 * (sidebar, header, stats, pages, modals) and owns all of the state they read.
 * These tests walk every page, drive the Settings controls and exercise the
 * sandbox → review → approve flow, so a component that stops rendering — or is
 * wired to the wrong piece of state — fails loudly instead of silently
 * disappearing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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

async function goToPage(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: label }))
}

/** Opens the sandbox from the header (the overview has a second trigger). */
async function openSandbox(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: "Open Sandbox" })[0])
  return await screen.findByRole("dialog", { name: "Sandbox simulation" })
}

const sandboxDialog = () => screen.queryByRole("dialog", { name: "Sandbox simulation" })

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

  it("reports the backend as connected once the health check answers", async () => {
    await renderDashboard()

    await waitFor(() => expect(screen.getByText("Backend connected")).toBeTruthy())
  })

  it("switches the theme from the header", async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole("button", { name: "Switch to light mode" }))
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }))
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy()
  })
})

describe("overview page", () => {
  it("shows the live data badge and the live alert set when no strategy is simulated", async () => {
    await renderDashboard()

    expect(screen.getByText("LIVE DATA")).toBeTruthy()
    expect(screen.queryByText(/Simulation active/)).toBeNull()
    expect(screen.getByText("Crowd buildup detected")).toBeTruthy()
    expect(screen.getByText("Redirect visitors or open an additional gate.")).toBeTruthy()
  })

  it("reflects the selected strategy across the overview panels", async () => {
    const user = userEvent.setup()
    await renderDashboard()

    const dialog = await openSandbox(user)
    await user.click(within(dialog).getByRole("button", { name: /Strategy A/ }))

    // The map badge, the predictive alerts and the sandbox teaser all read the
    // same selection, even though they are separate components.
    expect(screen.getByText("SIMULATION")).toBeTruthy()
    expect(screen.getByText("Crowd successfully redirected")).toBeTruthy()
    expect(screen.getByText("Reduced")).toBeTruthy()
    expect(screen.queryByText("Crowd buildup detected")).toBeNull()
  })
})

describe("crowd monitor page", () => {
  it("renders the zone cards and the crowd movement rows", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await goToPage(user, "Crowd Monitor")

    expect(screen.getByText("Monitor crowd density across every event zone.")).toBeTruthy()

    // Live (no strategy) utilisation: North Gate 92%, East Zone 54%, Transit 64%.
    expect(screen.getByText("North Gate")).toBeTruthy()
    expect(screen.getByText("92%")).toBeTruthy()
    expect(screen.getByText("54%")).toBeTruthy()

    // North Gate and Central Zone are both over the alert threshold.
    expect(screen.getAllByText("HIGH")).toHaveLength(2)
    expect(screen.getByText("NORMAL")).toBeTruthy()
    expect(screen.getByText("STABLE")).toBeTruthy()

    expect(screen.getByText("Crowd Movement")).toBeTruthy()
    expect(screen.getByText("North Gate → Central Zone")).toBeTruthy()
    expect(screen.getByText("Central Zone → East Zone")).toBeTruthy()
    expect(screen.getByText("East Zone → Transit")).toBeTruthy()
    expect(screen.getByText("High flow")).toBeTruthy()
    expect(screen.getByText("Moderate")).toBeTruthy()
    expect(screen.getByText("Normal")).toBeTruthy()
  })
})

describe("predictions page", () => {
  it("renders the forecast and opens the sandbox from the recommendation", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await goToPage(user, "Predictions")

    expect(screen.getByText("Next 60 Minutes Prediction")).toBeTruthy()
    expect(screen.getByText("89%")).toBeTruthy()
    expect(screen.getByText("74%")).toBeTruthy()
    expect(screen.getByText("58%")).toBeTruthy()
    expect(screen.getByText("71%")).toBeTruthy()
    expect(screen.getByText("North Gate forecast")).toBeTruthy()
    expect(screen.getByText("Open an additional North Gate within 20 minutes")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Test Response in Sandbox" }))
    expect(sandboxDialog()).toBeTruthy()
  })
})

describe("strategies page", () => {
  it("renders both strategies and opens the sandbox from either one", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await goToPage(user, "Strategies")

    expect(screen.getByText("Available operational responses.")).toBeTruthy()
    expect(screen.getByText("Redirect Crowd")).toBeTruthy()
    expect(screen.getByText("LOW RISK")).toBeTruthy()
    expect(screen.getByText("Open Additional Gate")).toBeTruthy()
    expect(screen.getByText("MEDIUM RISK")).toBeTruthy()

    const testButtons = screen.getAllByRole("button", { name: "Test Strategy" })
    expect(testButtons).toHaveLength(2)

    await user.click(testButtons[1])
    expect(sandboxDialog()).toBeTruthy()
  })
})

describe("settings page", () => {
  it("renders the current configuration values", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await goToPage(user, "Settings")

    expect(screen.getByText("System Configuration")).toBeTruthy()
    expect(screen.getByText("Configure event parameters and alert behavior.")).toBeTruthy()
    expect(screen.getByText("Alert Threshold (85%)")).toBeTruthy()
    expect(screen.getByText("Automatically generate predictive warnings")).toBeTruthy()
    expect(screen.getByText("Save Settings")).toBeTruthy()

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Mumbai Music Festival")
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("50000")
  })

  it("renaming the event updates the header title", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await goToPage(user, "Settings")

    const nameInput = screen.getByRole("textbox")
    await user.clear(nameInput)
    await user.type(nameInput, "Hackathon Finale")

    expect(screen.getByRole("heading", { name: "Hackathon Finale" })).toBeTruthy()
  })

  it("the alert threshold slider updates its own label", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await goToPage(user, "Settings")

    fireEvent.change(screen.getByRole("slider"), { target: { value: "70" } })

    expect(screen.getByText("Alert Threshold (70%)")).toBeTruthy()
    expect(screen.queryByText("Alert Threshold (85%)")).toBeNull()
  })

  it("the capacity field accepts a new number", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await goToPage(user, "Settings")

    const capacity = screen.getByRole("spinbutton") as HTMLInputElement
    fireEvent.change(capacity, { target: { value: "12345" } })

    expect(capacity.value).toBe("12345")
  })

  it("the Auto AI Alerts switch reflects and flips its state", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await goToPage(user, "Settings")

    const isOn = () =>
      screen.getByRole("button", { name: "Auto AI Alerts" }).getAttribute("aria-pressed")

    expect(isOn()).toBe("true")

    await user.click(screen.getByRole("button", { name: "Auto AI Alerts" }))
    expect(isOn()).toBe("false")
  })
})

describe("sandbox modal", () => {
  it("opens from the sidebar entry", async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await goToPage(user, "Sandbox")

    expect(sandboxDialog()).toBeTruthy()
  })

  it("requires a strategy before it can be reviewed", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    const dialog = await openSandbox(user)

    const reviewButton = () =>
      within(dialog).getByRole("button", { name: "Review Strategy" }) as HTMLButtonElement

    expect(reviewButton().disabled).toBe(true)
    expect(within(dialog).getByText("Select a strategy to continue")).toBeTruthy()

    await user.click(within(dialog).getByRole("button", { name: /Strategy A/ }))

    expect(reviewButton().disabled).toBe(false)
    expect(within(dialog).getByText("Strategy A selected for review")).toBeTruthy()
  })

  it("previews Strategy A redistribution and Strategy B capacity instead", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    const dialog = await openSandbox(user)

    // Nothing chosen yet.
    expect(within(dialog).getByText("Select a strategy to preview")).toBeTruthy()
    expect(
      within(dialog).getByText("Select Strategy A or Strategy B above to simulate its impact."),
    ).toBeTruthy()

    await user.click(within(dialog).getByRole("button", { name: /Strategy A/ }))
    expect(within(dialog).getByText("↓ Crowd reduced")).toBeTruthy()
    expect(within(dialog).getByText("↑ Crowd absorbed")).toBeTruthy()
    expect(within(dialog).getByText("Redirecting crowd")).toBeTruthy()

    await user.click(within(dialog).getByRole("button", { name: /Strategy B/ }))
    expect(within(dialog).getByText(/Strategy B increases entry capacity/)).toBeTruthy()
    expect(within(dialog).queryByText("↓ Crowd reduced")).toBeNull()
  })

  it("closes with the × button", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    const dialog = await openSandbox(user)

    await user.click(within(dialog).getByRole("button", { name: "×" }))

    expect(sandboxDialog()).toBeNull()
  })

  it("Cancel closes the sandbox and clears the simulated strategy", async () => {
    const user = userEvent.setup()
    await renderDashboard()
    const dialog = await openSandbox(user)

    await user.click(within(dialog).getByRole("button", { name: /Strategy A/ }))
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))

    expect(sandboxDialog()).toBeNull()
    // Cleared: the overview is back to live data with the live alert set.
    expect(screen.getByText("LIVE DATA")).toBeTruthy()
    expect(screen.getByText("Crowd buildup detected")).toBeTruthy()
  })
})

describe("sandbox → review → approve flow", () => {
  it("simulates a strategy, reviews it, approves it and starts execution", async () => {
    const user = userEvent.setup()
    await renderDashboard()

    const dialog = await openSandbox(user)
    await user.click(within(dialog).getByRole("button", { name: /Strategy A/ }))
    await user.click(within(dialog).getByRole("button", { name: "Review Strategy" }))

    const review = screen.getByRole("dialog", { name: "Strategy review" })
    expect(within(review).getByText("STRATEGY REVIEW")).toBeTruthy()
    expect(within(review).getByText("Predicted Crowd")).toBeTruthy()
    expect(within(review).getByText("68%")).toBeTruthy()
    expect(within(review).getByText("Low")).toBeTruthy()

    // Back leaves the review open-less but keeps the sandbox.
    await user.click(within(review).getByRole("button", { name: "Back" }))
    expect(screen.queryByRole("dialog", { name: "Strategy review" })).toBeNull()
    expect(sandboxDialog()).toBeTruthy()

    await user.click(
      within(sandboxDialog()!).getByRole("button", { name: "Review Strategy" }),
    )
    await user.click(
      within(screen.getByRole("dialog", { name: "Strategy review" })).getByRole("button", {
        name: "Approve Strategy",
      }),
    )

    // Both modals close and the execution panels pick the approval up.
    expect(sandboxDialog()).toBeNull()
    expect(screen.queryByRole("dialog", { name: "Strategy review" })).toBeNull()
    expect(screen.getByText("Strategy A is being executed")).toBeTruthy()
    expect(screen.getByText("Strategy A approved and execution started")).toBeTruthy()

    const toast = screen.getByRole("status")
    expect(within(toast).getByText("Strategy approved")).toBeTruthy()
    expect(within(toast).getByText("Strategy A is now being executed.")).toBeTruthy()

    await user.click(within(toast).getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByRole("status")).toBeNull()
  })
})
