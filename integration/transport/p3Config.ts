/**
 * Environment-driven configuration for the P1 → P3 transport.
 *
 * No secrets and no base URL are hard-coded here: everything is read from the
 * environment at construction time. The recommended way to run the transport
 * is `scripts/pushToP3.ts`, which loads a local `.env` file automatically
 * (same convention as the P3 backend's `backend/.env`).
 */

export type P3TransportConfig = {
  /** Base URL of the P3 FastAPI backend, e.g. `http://localhost:8000`. */
  baseUrl: string
  /** Shared P1→P3 secret; empty/undefined disables authentication. */
  apiKey?: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
  /** Maximum attempts per request (1 = no retries, 4 = initial + 3 retries). */
  maxAttempts: number
  /** Base backoff in milliseconds; attempt N waits BASE * 2^(N-1). */
  backoffBaseMs: number
  /** Optional cap on backoff delay in milliseconds. */
  backoffMaxMs?: number
  /**
   * Minimum interval between crowd-state POSTs (throttle). Updates arriving
   * faster than this replace the pending one (latest-wins batching).
   */
  crowdStateMinIntervalMs: number
  /** Queue backend: `"file"` persists to disk, `"memory"` keeps it in RAM. */
  queueBackend: "file" | "memory"
  /** Path of the local queue file (backend `"file"` only). */
  queueFilePath: string
  /** Logger for retry/queue diagnostics; defaults to console. */
  log?: (message: string) => void
}

/**
 * Read `process.env` without referencing Node globals at type level: the app
 * tsconfig targets the browser (`types: ["vite/client"]`), so the transport
 * stays type-clean there and still picks up the real environment under Node.
 */
function processEnv(): Record<string, string | undefined> {
  const holder = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return holder.process?.env ?? {}
}

export const P3_DEFAULTS = {
  timeoutMs: 5_000,
  maxAttempts: 4,
  backoffBaseMs: 200,
  backoffMaxMs: 8_000,
  crowdStateMinIntervalMs: 2_000,
  queueBackend: "file" as const,
  queueFilePath: ".p3-queue.jsonl",
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Build a config from environment variables, mirroring the P3 backend's
 * env-driven configuration style (backend/app/core/config.py).
 *
 * - `P3_BASE_URL`  — P3 FastAPI base URL (required)
 * - `P3_API_KEY`   — shared P1↔P3 secret (optional; unset disables auth)
 * - `P3_TIMEOUT_MS`, `P3_MAX_ATTEMPTS`, `P3_BACKOFF_BASE_MS`,
 *   `P3_CROWD_STATE_MIN_INTERVAL_MS`, `P3_QUEUE_BACKEND`, `P3_QUEUE_FILE`
 *
 * Throws when `P3_BASE_URL` is missing — that mapping must be explicit, never
 * guessed (backend/IMPLEMENTATION_NOTES.md §7).
 */
export function configFromEnv(
  env: Record<string, string | undefined> = processEnv(),
): P3TransportConfig {
  const baseUrl = nonEmpty(env.P3_BASE_URL)
  if (!baseUrl) {
    throw new Error(
      "P3_BASE_URL is not configured. Set it to the P3 backend base URL, " +
        "e.g. http://localhost:8000 (see integration/transport/README.md).",
    )
  }
  const number = (name: string, fallback: number): number => {
    const raw = nonEmpty(env[name])
    if (raw === undefined) return fallback
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${name} must be a non-negative number, got ${raw!}`)
    }
    return parsed
  }
  const backendRaw = nonEmpty(env.P3_QUEUE_BACKEND) ?? P3_DEFAULTS.queueBackend
  if (backendRaw !== "file" && backendRaw !== "memory") {
    throw new Error(`P3_QUEUE_BACKEND must be "file" or "memory", got ${backendRaw}`)
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""), // tolerate a trailing slash
    apiKey: nonEmpty(env.P3_API_KEY),
    timeoutMs: number("P3_TIMEOUT_MS", P3_DEFAULTS.timeoutMs),
    maxAttempts: Math.max(1, Math.trunc(number("P3_MAX_ATTEMPTS", P3_DEFAULTS.maxAttempts))),
    backoffBaseMs: number("P3_BACKOFF_BASE_MS", P3_DEFAULTS.backoffBaseMs),
    backoffMaxMs: number("P3_BACKOFF_MAX_MS", P3_DEFAULTS.backoffMaxMs),
    crowdStateMinIntervalMs: number(
      "P3_CROWD_STATE_MIN_INTERVAL_MS",
      P3_DEFAULTS.crowdStateMinIntervalMs,
    ),
    queueBackend: backendRaw,
    queueFilePath: nonEmpty(env.P3_QUEUE_FILE) ?? P3_DEFAULTS.queueFilePath,
    log: console.log,
  }
}
