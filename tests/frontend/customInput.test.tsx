// @vitest-environment jsdom
/**
 * Custom Input feature tests (task requirement 8 — frontend half).
 *
 * Mocks the P3 HTTP boundary and proves the required UI flow:
 *   button appears → form opens → validation works → submit calls the
 *   backend (POST then GET) → the RETURNED backend data is displayed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../frontend/src/App"
import CustomInputDialog from "../../frontend/src/CustomInputDialog"

const STORED_EVENT = {
  event_id: 42,
  name: "EV-CUSTOM-INPUT-001",
  start_time: "2026-10-10T04:30:00.000Z",
  end_time: "2026-10-10T16:00:00.000Z",
  status: "ACTIVE",
}

type FetchCall = { url: string; method: string; body?: unknown }

let fetchCalls: FetchCall[] = []

/**
 * P3 mock: POST stores the payload in-memory, GET returns the STORED row —
 * exactly the server-side behavior the real feature relies on.
 */
function mockP3() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      fetchCalls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })

      if (method === "POST" && url.endsWith("/api/events")) {
        const payload = JSON.parse(String(init?.body))
        return new Response(
          JSON.stringify({ success: true, data: { ...STORED_EVENT, ...payload, event_id: 42 } }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        )
      }

      if (method === "GET" && /\/api\/events\/\d+$/.test(url)) {
        return new Response(JSON.stringify({ success: true, data: STORED_EVENT }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response(
        JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "No route" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )
    }),
  )
}

beforeEach(() => {
  fetchCalls = []
  mockP3()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("CustomInputDialog (P4 → P3 flow)", () => {
  it("renders the Custom Input button", () => {
    render(<CustomInputDialog themeClasses={(c) => c} isDark />)
    expect(screen.getByRole("button", { name: "Custom Input" })).toBeTruthy()
  })

  it("opens the form when the button is clicked", async () => {
    const user = userEvent.setup()
    render(<CustomInputDialog themeClasses={(c) => c} isDark />)

    await user.click(screen.getByRole("button", { name: "Custom Input" }))

    expect(screen.getByText("Enter event data")).toBeTruthy()
    expect(screen.getByLabelText(/Event name/i)).toBeTruthy()
    expect(screen.getByLabelText(/Event date/i)).toBeTruthy()
    expect(screen.getByLabelText(/Start time/i)).toBeTruthy()
    expect(screen.getByLabelText(/End time/i)).toBeTruthy()
  })

  it("blocks submission with empty fields (client-side validation)", async () => {
    const user = userEvent.setup()
    render(<CustomInputDialog themeClasses={(c) => c} isDark />)

    await user.click(screen.getByRole("button", { name: "Custom Input" }))
    await user.click(screen.getByRole("button", { name: "Submit" }))

    expect(screen.getByText("All fields are required.")).toBeTruthy()
    expect(fetchCalls).toHaveLength(0) // nothing was sent to the backend
  })

  it("blocks submission when end time is not after start time", async () => {
    const user = userEvent.setup()
    render(<CustomInputDialog themeClasses={(c) => c} isDark />)

    await user.click(screen.getByRole("button", { name: "Custom Input" }))
    await user.type(screen.getByLabelText(/Event name/i), "EV-CUSTOM-INPUT-001")
    await user.type(screen.getByLabelText(/Event date/i), "2026-10-10")
    await user.type(screen.getByLabelText(/Start time/i), "18:00")
    await user.type(screen.getByLabelText(/End time/i), "17:00")
    await user.click(screen.getByRole("button", { name: "Submit" }))

    expect(screen.getByText("End time must be after start time.")).toBeTruthy()
    expect(fetchCalls).toHaveLength(0)
  })

  it("submits user-entered values to the backend and displays the returned record", async () => {
    const user = userEvent.setup()
    render(<CustomInputDialog themeClasses={(c) => c} isDark />)

    await user.click(screen.getByRole("button", { name: "Custom Input" }))
    await user.type(screen.getByLabelText(/Event name/i), "EV-CUSTOM-INPUT-001")
    await user.type(screen.getByLabelText(/Event date/i), "2026-10-10")
    await user.type(screen.getByLabelText(/Start time/i), "10:00")
    await user.type(screen.getByLabelText(/End time/i), "22:00")
    await user.click(screen.getByRole("button", { name: "Submit" }))

    await waitFor(() => expect(screen.getByTestId("custom-input-stored")).toBeTruthy())

    // The user-entered values actually went out in the POST body.
    const post = fetchCalls.find((call) => call.method === "POST")
    expect(post).toBeTruthy()
    expect((post!.body as { name: string }).name).toBe("EV-CUSTOM-INPUT-001")

    // POST → then a GET fetched the stored record back from the backend.
    const get = fetchCalls.find((call) => call.method === "GET")
    expect(get).toBeTruthy()
    expect(get!.url).toBe("http://localhost:8000/api/events/42")

    // The displayed data is the RETURNED backend record (id 42), not React state.
    expect(screen.getByText(/#42/)).toBeTruthy()
    expect(screen.getByText(/EV-CUSTOM-INPUT-001/)).toBeTruthy()
    expect(screen.getByText(/Saved to the database and fetched back/i)).toBeTruthy()
  })

  it("shows a backend validation error without crashing", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Invalid request: name: too long" },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )

    render(<CustomInputDialog themeClasses={(c) => c} isDark />)
    await user.click(screen.getByRole("button", { name: "Custom Input" }))
    await user.type(screen.getByLabelText(/Event name/i), "EV-CUSTOM-INPUT-001")
    await user.type(screen.getByLabelText(/Event date/i), "2026-10-10")
    await user.type(screen.getByLabelText(/Start time/i), "10:00")
    await user.type(screen.getByLabelText(/End time/i), "22:00")
    await user.click(screen.getByRole("button", { name: "Submit" }))

    await waitFor(() => expect(screen.getByText(/Invalid request/)).toBeTruthy())
  })

  it("shows a network error when the backend is unreachable", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))

    render(<CustomInputDialog themeClasses={(c) => c} isDark />)
    await user.click(screen.getByRole("button", { name: "Custom Input" }))
    await user.type(screen.getByLabelText(/Event name/i), "EV-CUSTOM-INPUT-001")
    await user.type(screen.getByLabelText(/Event date/i), "2026-10-10")
    await user.type(screen.getByLabelText(/Start time/i), "10:00")
    await user.type(screen.getByLabelText(/End time/i), "22:00")
    await user.click(screen.getByRole("button", { name: "Submit" }))

    await waitFor(() =>
      expect(screen.getByText(/Cannot reach the EventFlow backend/i)).toBeTruthy(),
    )
  })
})

describe("Custom Input inside the App dashboard", () => {
  it("shows the button in the header and displays the stored record after submit", async () => {
    const user = userEvent.setup()
    render(<App />)

    // The app starts on the fake login screen (existing behavior).
    await user.type(screen.getByPlaceholderText("organizer@event.com"), "organizer@event.com")
    await user.type(screen.getByPlaceholderText("••••••••"), "password")
    await user.click(screen.getByRole("button", { name: "Login" }))

    // The Custom Input button appears next to "Open Sandbox".
    expect(screen.getByRole("button", { name: "Custom Input" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Custom Input" }))
    await user.type(screen.getByLabelText(/Event name/i), "EV-CUSTOM-INPUT-001")
    await user.type(screen.getByLabelText(/Event date/i), "2026-10-10")
    await user.type(screen.getByLabelText(/Start time/i), "10:00")
    await user.type(screen.getByLabelText(/End time/i), "22:00")
    await user.click(screen.getByRole("button", { name: "Submit" }))

    await waitFor(() => expect(screen.getByTestId("custom-input-stored")).toBeTruthy())

    // Dismiss the modal: the Overview page shows the fetched backend record.
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.getByText("Stored custom event data")).toBeTruthy()
    expect(screen.getByText(/EV-CUSTOM-INPUT-001/)).toBeTruthy()
    expect(screen.getByText(/#42/)).toBeTruthy()
  })
})
