import { configFromEnv } from "./p3Config"
import type { P3TransportConfig } from "./p3Config"
import { serializeMetric, serializeSimulationResult } from "../../engine/src/serialization"
import type { CapacityMetric, SimulationResult } from "../../engine/src/types"
import { createQueue, isValidEndpoint, newEntryId } from "./p3Queue"
import type { QueuedPayload } from "./p3Queue"

/**
 * P1 → P3 HTTP transport (the missing runtime connection).
 *
 * - Uses P1's own serializers (`engine/src/serialization.ts`) — no second
 *   wire format, no recalculated crowd intelligence.
 * - POSTs to the two existing P3 ingestion endpoints
 *   (`POST /api/internal/crowd-state`, `POST /api/internal/simulations`),
 *   whose schemas live in `backend/app/schemas/p1.py`.
 * - Authenticates with a shared bearer token from env config (optional).
 * - Bounded exponential-backoff retries, then local queue; never throws,
 *   so a P3 outage can never stop the P1 simulation.
 *
 * `event_id` / `strategy_set_id` are P3-side envelope fields that P1 does not
 * know (documented unresolved mapping — backend/IMPLEMENTATION_NOTES.md §7),
 * so they must be supplied explicitly via config; the client never guesses.
 */

const CROWD_STATE_PATH = "/api/internal/crowd-state"
const SIMULATIONS_PATH = "/api/internal/simulations"

export type P3SendResult = {
  /**
   * `"sent"` — 2xx response; `"queued"` — stored locally after retries were
   * exhausted; `"superseded"` — replaced by a newer crowd-state snapshot
   * inside the throttle window (latest-wins batching), intentionally not sent.
   */
  status: "sent" | "queued" | "superseded"
  /** HTTP status of the last attempt (`undefined` for connection errors). */
  httpStatus?: number
  /** Response body (parsed JSON) of the last attempt, for diagnostics. */
  response?: unknown
}

/** Minimal structural fetch type so tests can inject fakes without DOM lib assumptions. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>

export type P3ClientOptions = {
  /** Injection point for tests; defaults to global fetch. */
  fetch?: FetchLike
  /** Test injection point for the backoff clock. */
  sleep?: (ms: number) => Promise<void>
  /** Test injection point for `Date.now()` (throttle clock). */
  now?: () => number
}

/** Exact request body for `POST /api/internal/crowd-state`. */
export type P3CrowdStateRequest = {
  event_id: number
  timestamp: string | null
  metrics: Record<string, unknown>[]
}

/** Exact request body for `POST /api/internal/simulations`. */
export type P3SimulationRequest = {
  strategy_set_id: number
  result: Record<string, unknown>
}

/**
 * Build the crowd-state request body from P1 metrics using P1's own
 * `serializeMetric`. 1:1 field mapping — nulls stay null, zeros stay zero,
 * P1 node ids and timestamps unchanged.
 */
export function buildCrowdStateRequest(
  metrics: CapacityMetric[] | Record<string, unknown>[],
  options: { eventId: number; timestamp?: string | null },
): P3CrowdStateRequest {
  return {
    event_id: options.eventId,
    timestamp: options.timestamp ?? null,
    metrics: metrics.map((metric) => serializeMetric(metric as CapacityMetric)),
  }
}

/**
 * Build the simulation request body from a completed P1 result using P1's
 * own `serializeSimulationResult`. 1:1 field mapping onto P3's
 * `P1SimulationResult` schema; the P1 result `id` is preserved verbatim.
 */
export function buildSimulationRequest(
  result: SimulationResult,
  options: { strategySetId: number },
): P3SimulationRequest {
  return { strategy_set_id: options.strategySetId, result: serializeSimulationResult(result) }
}

/** Retryable = network-level failure (no status) or server-side 5xx. */
function isRetryable(httpStatus: number | undefined): boolean {
  return httpStatus === undefined || (httpStatus >= 500 && httpStatus <= 599)
}

/** One delivery pipeline: build → bounded retry → local queue. Never throws. */
export class P3Client {
  private readonly config: P3TransportConfig
  private readonly queue: ReturnType<typeof createQueue>
  private readonly fetchImpl: FetchLike
  private readonly sleepImpl: (ms: number) => Promise<void>
  private readonly nowImpl: () => number
  private lastCrowdStateSentAt = Number.NEGATIVE_INFINITY
  /** Latest crowd-state payload awaiting the throttle window (latest-wins). */
  private pendingCrowdState: { request: P3CrowdStateRequest; resolve: (result: P3SendResult) => void } | null = null
  private crowdTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: P3TransportConfig, options: P3ClientOptions = {}) {
    this.config = config
    this.queue = createQueue(config)
    this.fetchImpl =
      options.fetch ??
      ((input, init) => fetch(input, init))
    this.sleepImpl = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.nowImpl = options.now ?? (() => Date.now())
  }

  /** `Authorization: Bearer <P3_API_KEY>` only when configured (never logged). */
  private authHeaders(): Record<string, string> {
    if (!this.config.apiKey) return {}
    return { Authorization: `Bearer ${this.config.apiKey}` }
  }

  /** Single POST attempt with timeout. Throws only on network error/timeout. */
  private async attempt(endpointPath: string, body: unknown): Promise<{ httpStatus?: number; response?: unknown }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}${endpointPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.authHeaders() },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      let parsed: unknown
      try {
        parsed = await response.json()
      } catch {
        parsed = undefined
      }
      return { httpStatus: response.status, response: parsed }
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Deliver a request body with bounded exponential backoff, then queue.
   * Backoff waits `base * 2^attemptIndex` capped at `backoffMaxMs`.
   * 4xx responses are NOT retried (invalid payload — retrying cannot fix it;
   * the payload is queued once for inspection/replay).
   */
  private async deliver(endpointPath: string, body: unknown): Promise<P3SendResult> {
    let lastError: string | null = null
    let lastStatus: number | undefined
    let lastResponse: unknown
    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      if (attempt > 0) {
        const cap = this.config.backoffMaxMs ?? Number.POSITIVE_INFINITY
        await this.sleepImpl(Math.min(this.config.backoffBaseMs * 2 ** (attempt - 1), cap))
      }
      try {
        const { httpStatus, response } = await this.attempt(endpointPath, body)
        if (httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300) {
          return { status: "sent", httpStatus, response }
        }
        lastStatus = httpStatus
        lastResponse = response
        lastError = `HTTP ${httpStatus}`
      } catch (error) {
        lastStatus = undefined
        lastError = error instanceof Error ? error.message : String(error)
      }
      this.config.log?.(
        `[p3-transport] POST ${endpointPath} attempt ${attempt + 1}/${this.config.maxAttempts} failed: ${lastError}`,
      )
      if (!isRetryable(lastStatus)) break
    }
    const kind = endpointPath === CROWD_STATE_PATH ? "crowd-state" : "simulations"
    const entry: QueuedPayload = {
      id: newEntryId(),
      kind,
      payload: body,
      queuedAt: new Date().toISOString(),
      error: lastError ?? "unknown error",
    }
    await this.queue.enqueue(entry)
    this.config.log?.(
      `[p3-transport] ${kind} payload stored in local queue after ` +
        `${this.config.maxAttempts} attempt(s): ${lastError}`,
    )
    return { status: "queued", httpStatus: lastStatus, response: lastResponse }
  }

  /**
   * Throttled crowd-state delivery (latest-wins batching, requirement §8).
   * At most one POST per `crowdStateMinIntervalMs`; an update arriving inside
   * the window replaces the pending one — only the latest snapshot goes out.
   * Never throws; resolves once the payload is sent, queued or superseded.
   */
  async sendCrowdStateUpdate(
    metrics: CapacityMetric[] | Record<string, unknown>[],
    options: { eventId: number; timestamp?: string | null },
  ): Promise<P3SendResult> {
    const request = buildCrowdStateRequest(metrics, options)
    const wait = this.config.crowdStateMinIntervalMs - (this.nowImpl() - this.lastCrowdStateSentAt)
    if (wait <= 0) {
      this.lastCrowdStateSentAt = this.nowImpl()
      return await this.deliver(CROWD_STATE_PATH, request)
    }
    // Inside the throttle window: batch, latest wins.
    this.pendingCrowdState?.resolve({ status: "superseded" })
    return await new Promise<P3SendResult>((resolve) => {
      this.pendingCrowdState = { request, resolve }
      if (this.crowdTimer === null) {
        this.crowdTimer = setTimeout(() => {
          this.crowdTimer = null
          const pending = this.pendingCrowdState
          this.pendingCrowdState = null
          if (!pending) return
          this.lastCrowdStateSentAt = this.nowImpl()
          void this.deliver(CROWD_STATE_PATH, pending.request).then(pending.resolve)
        }, wait)
      }
    })
  }

  /**
   * Completed simulation result → existing `POST /api/internal/simulations`.
   * Sent immediately (simulation completion is a meaningful boundary, not
   * throttled). Never throws.
   */
  async sendSimulationResult(
    result: SimulationResult,
    options: { strategySetId: number },
  ): Promise<P3SendResult> {
    return await this.deliver(SIMULATIONS_PATH, buildSimulationRequest(result, options))
  }

  /**
   * Replay the local queue (FIFO, oldest first). Successfully delivered
   * entries are removed; failed entries stay queued for the next call.
   * Safe to call repeatedly, e.g. on a timer once P3 recovers.
   */
  async retryQueued(): Promise<{ delivered: number; remaining: number }> {
    const entries = await this.queue.drainAll()
    let delivered = 0
    for (const entry of entries) {
      if (!isValidEndpoint(entry.kind)) continue
      const path = entry.kind === "crowd-state" ? CROWD_STATE_PATH : SIMULATIONS_PATH
      const result = await this.deliver(path, entry.payload)
      if (result.status === "sent") {
        await this.queue.remove([entry])
        delivered += 1
      } else if (result.status === "queued") {
        // `deliver` already appended a fresh copy with the latest error;
        // drop the stale copy so the queue never accumulates duplicates.
        await this.queue.remove([entry])
      }
    }
    const remaining = await this.queue.size()
    return { delivered, remaining }
  }

  /** Number of payloads currently waiting in the local queue. */
  async queueSize(): Promise<number> {
    return await this.queue.size()
  }
}

/** Convenience factory: environment-driven config + default transports. */
export function createP3Client(options: P3ClientOptions = {}): P3Client {
  return new P3Client(configFromEnv(), options)
}
