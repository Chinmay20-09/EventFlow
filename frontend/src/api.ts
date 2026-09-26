/**
 * P4 → P3 API utility (Custom Input feature).
 *
 * The base URL comes from the environment (Vite `VITE_P3_BASE_URL`) with the
 * local dev default `http://localhost:8000` — the same env-driven convention
 * as the P1→P3 transport (`integration/transport/p3Config.ts`), never a value
 * invented per-feature. Every response uses the documented P3 envelope:
 *
 *   Success: {"success": true,  "data": {...}}
 *   Failure: {"success": false, "error": {"code": "...", "message": "..."}}
 */

const P3_BASE_URL = (import.meta.env.VITE_P3_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "http://localhost:8000"

/** One stored Event row, as returned by `GET /api/events/{id}`. */
export type StoredEvent = {
  event_id: number
  name: string
  start_time: string | null
  end_time: string | null
  status: string
}

export type ApiError = {
  /** Error envelope `code` (VALIDATION_ERROR, NOT_FOUND, ...) or "NETWORK_ERROR". */
  code: string
  message: string
}

function extractError(body: unknown, fallback: string): ApiError {
  const error = (body as { error?: { code?: string; message?: string } } | null)?.error
  return { code: error?.code ?? "UNKNOWN_ERROR", message: error?.message ?? fallback }
}

/**
 * POST the user-entered custom event data to P3 and return the stored record.
 * Throws `ApiError` on validation (422), backend (4xx/5xx) and network errors.
 */
export async function createCustomEvent(input: {
  name: string
  start_time: string
  end_time: string
}): Promise<StoredEvent> {
  let response: Response
  try {
    response = await fetch(`${P3_BASE_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  } catch {
    // fetch rejects on network failure/DNS/CORS-block — never leak internals.
    throw { code: "NETWORK_ERROR", message: "Cannot reach the EventFlow backend. Is it running?" } as ApiError
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw extractError(body, `Backend returned status ${response.status}`)
  }
  if (body?.success !== true || !body?.data) {
    throw extractError(body, "Unexpected backend response")
  }
  return body.data as StoredEvent
}

/** Fetch one stored Event back from P3 (the database is the source of truth). */
export async function getStoredEvent(eventId: number): Promise<StoredEvent> {
  let response: Response
  try {
    response = await fetch(`${P3_BASE_URL}/api/events/${eventId}`)
  } catch {
    throw { code: "NETWORK_ERROR", message: "Cannot reach the EventFlow backend. Is it running?" } as ApiError
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw extractError(body, `Backend returned status ${response.status}`)
  }
  if (body?.success !== true || !body?.data) {
    throw extractError(body, "Unexpected backend response")
  }
  return body.data as StoredEvent
}
