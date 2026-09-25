import type { P3TransportConfig } from "./p3Config"

/**
 * Minimal temporary store for payloads that failed to reach P3 after all
 * retries. Purpose: never silently lose a payload, never crash the P1
 * simulation because P3 is down (requirements §6/§7).
 *
 * Deliberately NOT a persistence architecture: an append-only JSONL file (or
 * an in-memory list for tests) is enough for the hackathon MVP. It never
 * touches the P3 database.
 *
 * Each entry preserves everything needed to replay later:
 * - `kind`       — which P3 endpoint the payload belongs to
 * - `payload`    — the exact request body that was not delivered
 * - `queuedAt`   — when it was stored (diagnostics)
 * - `error`      — why the last attempt failed (diagnostics; no secrets)
 *
 * Corrupted trailing lines (partial write, crash mid-append) are skipped, not
 * fatal — replay continues with the remaining intact entries.
 */

export type P3Endpoint = "crowd-state" | "simulations"

export type QueuedPayload = {
  /** Unique identity of this queue entry (for remove-after-replay). */
  id: string
  kind: P3Endpoint
  payload: unknown
  queuedAt: string
  error: string | null
}

/**
 * Unique per-entry id. A plain counter+timestamp: dependency-free, unique
 * even when two payloads are queued within the same millisecond.
 */
let entrySequence = 0
export function newEntryId(): string {
  entrySequence += 1
  return `q${Date.now().toString(36)}-${entrySequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface PayloadQueue {
  /** Append a payload that could not be delivered after all retries. */
  enqueue(entry: QueuedPayload): Promise<void>
  /** FIFO snapshot of everything currently stored (oldest first). */
  drainAll(): Promise<QueuedPayload[]>
  /** Remove the given entries (key comparison) after successful replay. */
  remove(entries: QueuedPayload[]): Promise<void>
  /** Number of stored payloads. */
  size(): Promise<number>
}

/** Best-effort JSON stringify; falls back to a diagnostic placeholder. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '"<unserializable payload>"'
  }
}

/** Identity key for remove-after-replay semantics across queue backends. */
function entryKey(entry: QueuedPayload): string {
  return entry.id
}

export function isValidEndpoint(value: unknown): value is P3Endpoint {
  return value === "crowd-state" || value === "simulations"
}

/**
 * Structural subset of `node:fs` used by FilePayloadQueue. Declared locally
 * so the transport keeps type-checking in browser-oriented tsconfigs and so
 * the Node dependency stays lazy and dynamic (ESM — no `require`).
 */
type MinimalFs = {
  appendFileSync(path: string, data: string, encoding: string): void
  readFileSync(path: string, encoding: string): string
  writeFileSync(path: string, data: string, encoding: string): void
  existsSync(path: string): boolean
}
type FsModule = MinimalFs & { default: MinimalFs }

async function loadFs(): Promise<MinimalFs> {
  // Widened specifier: keeps the browser-oriented app tsconfig (no Node
  // types) type-clean while resolving to `node:fs` at runtime under Node.
  const specifier = "node:" + "fs"
  const mod = (await import(/* @vite-ignore */ specifier)) as unknown as FsModule
  return mod.default ?? mod
}

/** In-memory queue — used by unit tests and `P3_QUEUE_BACKEND=memory`. */
export class MemoryPayloadQueue implements PayloadQueue {
  private entries: QueuedPayload[] = []

  async enqueue(entry: QueuedPayload): Promise<void> {
    this.entries.push({ ...entry })
  }

  async drainAll(): Promise<QueuedPayload[]> {
    return this.entries.map((entry) => ({ ...entry }))
  }

  async remove(entries: QueuedPayload[]): Promise<void> {
    const removeKeys = new Set(entries.map(entryKey))
    this.entries = this.entries.filter((kept) => !removeKeys.has(entryKey(kept)))
  }

  async size(): Promise<number> {
    return this.entries.length
  }
}

/**
 * Append-only JSONL file queue. `node:fs` is imported lazily and dynamically
 * so the transport module stays loadable outside Node (the app tsconfig has
 * no Node types) and so unit tests can stay filesystem-free with the memory
 * backend.
 */
export class FilePayloadQueue implements PayloadQueue {
  private readonly filePath: string
  private readonly log?: (message: string) => void
  private fsPromise: Promise<MinimalFs> | null = null

  constructor(filePath: string, log?: (message: string) => void) {
    this.filePath = filePath
    this.log = log
  }

  private fs(): Promise<MinimalFs> {
    if (this.fsPromise === null) this.fsPromise = loadFs()
    return this.fsPromise
  }

  async enqueue(entry: QueuedPayload): Promise<void> {
    try {
      const fs = await this.fs()
      fs.appendFileSync(this.filePath, `${safeStringify(entry)}\n`, "utf8")
    } catch (error) {
      // Disk failures must not crash the P1 simulation; the loss is reported,
      // never silent (requirement §7).
      this.log?.(
        `[p3-transport] ERROR: could not append payload to queue file ` +
          `${this.filePath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async drainAll(): Promise<QueuedPayload[]> {
    try {
      const fs = await this.fs()
      if (!fs.existsSync(this.filePath)) return []
      const entries: QueuedPayload[] = []
      for (const line of fs.readFileSync(this.filePath, "utf8").split("\n")) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed) as QueuedPayload
          if (parsed && isValidEndpoint(parsed.kind)) entries.push(parsed)
        } catch {
          // Torn trailing line (crash mid-append) — skip, not fatal.
          this.log?.(`[p3-transport] skipping unreadable queue line in ${this.filePath}`)
        }
      }
      return entries
    } catch (error) {
      this.log?.(
        `[p3-transport] ERROR: could not read queue file ${this.filePath}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      )
      return []
    }
  }

  async remove(entries: QueuedPayload[]): Promise<void> {
    if (entries.length === 0) return
    try {
      const fs = await this.fs()
      if (!fs.existsSync(this.filePath)) return
      const removeKeys = new Set(entries.map(entryKey))
      const remaining = (await this.drainAll()).filter((kept) => !removeKeys.has(entryKey(kept)))
      fs.writeFileSync(
        this.filePath,
        remaining.map((kept) => safeStringify(kept)).join("\n") + (remaining.length ? "\n" : ""),
        "utf8",
      )
    } catch (error) {
      // Keep the entries on disk (at-least-once replay) rather than losing them.
      this.log?.(
        `[p3-transport] ERROR: could not rewrite queue file ${this.filePath}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async size(): Promise<number> {
    return (await this.drainAll()).length
  }
}

export function createQueue(config: P3TransportConfig): PayloadQueue {
  return config.queueBackend === "memory"
    ? new MemoryPayloadQueue()
    : new FilePayloadQueue(config.queueFilePath, config.log)
}
