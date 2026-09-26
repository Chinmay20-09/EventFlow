import { beforeEach, describe, expect, it } from "vitest"
import { buildCrowdStateRequest, buildSimulationRequest, P3Client } from "../../integration/transport/p3Client"
import type { P3ClientOptions } from "../../integration/transport/p3Client"
import { MemoryPayloadQueue } from "../../integration/transport/p3Queue"
import type { CapacityMetric, SimulationResult } from "../../engine/src/types"

/** A capacity metric in P1's internal camelCase shape (as `capacityMetric` returns it). */
const metric: CapacityMetric = {
  id: "HALL",
  physicalCapacity: 5000,
  operationalCapacity: 4500,
  currentOccupancy: 3200,
  inflow: 120.5,
  outflow: 100.25,
  utilization: 0.71,
  queueSize: 12,
  overflow: 0,
  bottleneck: false,
  flow: 20.25,
  holdingUtilization: 0.6,
  serviceUtilization: null,
  flowUtilization: null,
  overloaded: false,
  density: 0.42,
  densityState: "MEDIUM",
}

const zeroNullMetric: CapacityMetric = {
  ...metric,
  id: "EMPTY",
  physicalCapacity: null,
  operationalCapacity: null,
  currentOccupancy: 0,
  utilization: null,
  density: null,
  queueSize: 0,
  overloaded: null,
}

function jsonOk(body: unknown = { success: true }): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

/** Fetch fake that records every call. */
function recordingFetch(handler?: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Response) {
  const calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = []
  const fetchImpl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, init })
    if (handler) return handler(url, init)
    return jsonOk()
  }
  return { calls, fetchImpl: fetchImpl as unknown as P3ClientOptions["fetch"] }
}

/** Build a client whose queue is an injectable memory queue. */
function makeClient(
  configOverrides: Record<string, unknown> = {},
  options: P3ClientOptions = {},
): { client: P3Client; queue: MemoryPayloadQueue } {
  const queue = new MemoryPayloadQueue()
  const config = {
    baseUrl: "http://p3.test:8000",
    apiKey: undefined,
    timeoutMs: 1_000,
    maxAttempts: 3,
    backoffBaseMs: 1,
    backoffMaxMs: 10,
    crowdStateMinIntervalMs: 0,
    queueBackend: "memory" as const,
    queueFilePath: "",
    ...configOverrides,
  }
  const client = new P3Client(config, options)
  // Replace the queue created inside the constructor with the test memory queue.
  ;(client as unknown as { queue: MemoryPayloadQueue }).queue = queue
  return { client, queue }
}

const minimalSimResult: SimulationResult = {
  ...(await buildRealSimResult()),
  id: "SIM-1",
  scenarioId: "S1",
  strategyId: null,
}

/** A REAL P1 result (the serializer requires the complete shape). */
async function buildRealSimResult(): Promise<SimulationResult> {
  const { runSandbox } = await import("../../engine/src/index")
  const graphInput = {
    nodes: [
      { id: "A", label: "Entry", type: "ENTRANCE" as const, capacity: 100, status: "OPEN" as const },
      { id: "C", label: "Exit", type: "EXIT" as const, capacity: 100, status: "OPEN" as const },
    ],
    edges: [
      { id: "AC", from: "A", to: "C", distance: 10, baselineTime: 10, currentTime: 10, capacity: 60, status: "OPEN" as const },
    ],
  }
  const crowd = [{ id: "g1", population: 10, currentLocation: { kind: "NODE" as const, id: "A" }, destination: "C" }]
  return runSandbox({ graph: graphInput, crowd, parameters: { durationSeconds: 0, timestepSeconds: 10 } })
}

describe("P3 request-body construction", () => {
  it("maps a crowd-state payload 1:1 onto the P3 schema (endpoint 1)", () => {
    const body = buildCrowdStateRequest([metric], { eventId: 7, timestamp: "2026-10-10T12:00:00Z" })
    expect(body.event_id).toBe(7)
    expect(body.timestamp).toBe("2026-10-10T12:00:00Z")
    expect(body.metrics).toEqual([
      {
        id: "HALL",
        physical_capacity: 5000,
        operational_capacity: 4500,
        current_occupancy: 3200,
        inflow: 120.5,
        outflow: 100.25,
        utilization: 0.71,
        queue_size: 12,
        overflow: 0,
        bottleneck: false,
        flow: 20.25,
        holding_utilization: 0.6,
        service_utilization: null,
        flow_utilization: null,
        overloaded: false,
        density: 0.42,
        density_state: "MEDIUM",
      },
    ])
  })

  it("preserves null as null and 0 as 0 in the crowd-state payload", () => {
    const body = buildCrowdStateRequest([zeroNullMetric], { eventId: 7 })
    const stored = body.metrics[0] as Record<string, unknown>
    expect(stored.physical_capacity).toBeNull()
    expect(stored.utilization).toBeNull()
    expect(stored.density).toBeNull()
    expect(stored.current_occupancy).toBe(0)
    expect(stored.queue_size).toBe(0)
  })

  it("maps a simulation result 1:1 onto the P3 envelope (endpoint 2)", () => {
    const body = buildSimulationRequest(minimalSimResult, { strategySetId: 3 })
    expect(body.strategy_set_id).toBe(3)
    expect(body.result).toMatchObject({
      id: "SIM-1",
      status: "COMPLETED",
      scenario_id: "S1",
      strategy_id: null,
    })
    expect(body.result).not.toHaveProperty("scenarioId")
  })
})

describe("P3 HTTP transport", () => {
  let sleepCalls: number[]
  const noSleep = async () => undefined

  beforeEach(() => {
    sleepCalls = []
  })

  const sleepTracking = (): ((ms: number) => Promise<void>) =>
    async (ms: number) => {
      sleepCalls.push(ms)
    }

  it("POSTs the crowd-state payload to the exact endpoint with JSON content type", async () => {
    const { calls, fetchImpl } = recordingFetch()
    const { client } = makeClient({}, { fetch: fetchImpl, sleep: noSleep })
    await client.sendCrowdStateUpdate([metric], { eventId: 7 })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("http://p3.test:8000/api/internal/crowd-state")
    expect(calls[0].init?.method).toBe("POST")
    expect(calls[0].init?.headers?.["Content-Type"]).toBe("application/json")
    const body = JSON.parse(calls[0].init?.body ?? "{}")
    expect(body.event_id).toBe(7)
    expect(body.metrics[0].id).toBe("HALL")
  })

  it("POSTs the simulation result to the exact endpoint preserving the P1 id", async () => {
    const { calls, fetchImpl } = recordingFetch()
    const { client } = makeClient({}, { fetch: fetchImpl, sleep: noSleep })
    await client.sendSimulationResult(minimalSimResult, { strategySetId: 3 })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("http://p3.test:8000/api/internal/simulations")
    expect(calls[0].init?.method).toBe("POST")
    const body = JSON.parse(calls[0].init?.body ?? "{}")
    expect(body.strategy_set_id).toBe(3)
    expect(body.result.id).toBe("SIM-1")
  })

  it("sends no Authorization header when no API key is configured", async () => {
    const { calls, fetchImpl } = recordingFetch()
    const { client } = makeClient({ apiKey: undefined }, { fetch: fetchImpl, sleep: noSleep })
    await client.sendCrowdStateUpdate([metric], { eventId: 7 })
    expect(calls[0].init?.headers?.["Authorization"]).toBeUndefined()
  })

  it("builds the Authorization header from the configured shared key", async () => {
    const { calls, fetchImpl } = recordingFetch()
    const { client } = makeClient({ apiKey: "secret-test-key" }, { fetch: fetchImpl, sleep: noSleep })
    await client.sendCrowdStateUpdate([metric], { eventId: 7 })
    expect(calls[0].init?.headers?.["Authorization"]).toBe("Bearer secret-test-key")
  })

  it("does not log or expose the API key in retry diagnostics", async () => {
    const logs: string[] = []
    const { fetchImpl } = recordingFetch(() => jsonResponse(500, { detail: "boom" }))
    const { client } = makeClient(
      { apiKey: "secret-test-key", log: (m) => logs.push(m) },
      { fetch: fetchImpl, sleep: noSleep },
    )
    const result = await client.sendCrowdStateUpdate([metric], { eventId: 7 })
    expect(result.status).toBe("queued")
    for (const line of logs) expect(line).not.toContain("secret-test-key")
  })

  it("returns sent on 2xx", async () => {
    const { fetchImpl } = recordingFetch(() => jsonOk({ success: true }))
    const { client } = makeClient({}, { fetch: fetchImpl, sleep: noSleep })
    const result = await client.sendSimulationResult(minimalSimResult, { strategySetId: 3 })
    expect(result.status).toBe("sent")
    expect(result.httpStatus).toBe(200)
  })

  it("treats connection failure as retryable and queues after the final attempt", async () => {
    const { fetchImpl } = recordingFetch(() => {
      throw new Error("connect ECONNREFUSED")
    })
    const { client, queue } = makeClient({ maxAttempts: 3 }, { fetch: fetchImpl, sleep: noSleep })
    const result = await client.sendSimulationResult(minimalSimResult, { strategySetId: 3 })
    expect(result.status).toBe("queued")
    expect(await queue.size()).toBe(1)
    const entries = await queue.drainAll()
    expect(entries[0].kind).toBe("simulations")
    expect(entries[0].error).toContain("ECONNREFUSED")
  })

  it("applies exponential backoff between retries", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse(503, { detail: "unavailable" }))
    const { client } = makeClient(
      { maxAttempts: 4, backoffBaseMs: 100, backoffMaxMs: 10_000 },
      { fetch: fetchImpl, sleep: sleepTracking() },
    )
    const result = await client.sendCrowdStateUpdate([metric], { eventId: 7 })
    expect(result.status).toBe("queued")
    expect(sleepCalls).toEqual([100, 200, 400]) // base * 2^(attemptIndex)
  })

  it("caps backoff at backoffMaxMs", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse(500, { detail: "boom" }))
    const { client } = makeClient(
      { maxAttempts: 4, backoffBaseMs: 100, backoffMaxMs: 150 },
      { fetch: fetchImpl, sleep: sleepTracking() },
    )
    await client.sendCrowdStateUpdate([metric], { eventId: 7 })
    expect(sleepCalls).toEqual([100, 150, 150])
  })

  it("stops retrying after the configured attempt limit", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse(500, { detail: "boom" }))
    const { client } = makeClient({ maxAttempts: 3 }, { fetch: fetchImpl, sleep: noSleep })
    await client.sendSimulationResult(minimalSimResult, { strategySetId: 3 })
    expect(calls).toHaveLength(3) // never more than maxAttempts
  })

  it("does NOT retry 4xx validation failures (single attempt) but still queues once", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse(422, { detail: "VALIDATION_ERROR" }))
    const { client, queue } = makeClient({ maxAttempts: 3 }, { fetch: fetchImpl, sleep: noSleep })
    const result = await client.sendCrowdStateUpdate([metric], { eventId: 7 })
    expect(calls).toHaveLength(1) // one attempt, no blind retry
    expect(result.status).toBe("queued")
    expect(result.httpStatus).toBe(422)
    expect(await queue.size()).toBe(1)
  })

  it("does not throw when P3 is unreachable (simulation must survive)", async () => {
    const { fetchImpl } = recordingFetch(() => {
      throw new Error("connect ECONNREFUSED")
    })
    const { client } = makeClient({ maxAttempts: 2 }, { fetch: fetchImpl, sleep: noSleep })
    await expect(client.sendSimulationResult(minimalSimResult, { strategySetId: 3 })).resolves.toBeTruthy()
  })

  it("retries queued payloads successfully when P3 recovers", async () => {
    // First: everything fails and is queued.
    const failing = recordingFetch(() => {
      throw new Error("connect ECONNREFUSED")
    })
    const { client, queue } = makeClient({ maxAttempts: 1 }, { fetch: failing.fetchImpl, sleep: noSleep })
    await client.sendCrowdStateUpdate([metric], { eventId: 7 })
    await client.sendSimulationResult(minimalSimResult, { strategySetId: 3 })
    expect(await queue.size()).toBe(2)

    // Then: P3 recovers; replay delivers both payloads in FIFO order.
    const recovered = recordingFetch()
    ;(client as unknown as { fetchImpl: P3ClientOptions["fetch"] }).fetchImpl = recovered.fetchImpl
    const report = await client.retryQueued()
    expect(report.delivered).toBe(2)
    expect(report.remaining).toBe(0)
    expect(await queue.size()).toBe(0)
    expect(recovered.calls).toHaveLength(2)
    expect(recovered.calls[0].url).toContain("/api/internal/crowd-state")
    expect(recovered.calls[1].url).toContain("/api/internal/simulations")
  })

  it("keeps failed entries in the queue after an unsuccessful replay", async () => {
    const failing = recordingFetch(() => {
      throw new Error("connect ECONNREFUSED")
    })
    const { client, queue } = makeClient({ maxAttempts: 1 }, { fetch: failing.fetchImpl, sleep: noSleep })
    await client.sendSimulationResult(minimalSimResult, { strategySetId: 3 })
    expect(await queue.size()).toBe(1)
    const report = await client.retryQueued() // P3 still down
    expect(report.delivered).toBe(0)
    expect(report.remaining).toBe(1) // not silently lost
  })
})

describe("crowd-state throttle (latest-wins batching)", () => {
  it("sends the latest snapshot once per throttle window", async () => {
    let clock = 0
    const { calls, fetchImpl } = recordingFetch()
    const { client } = makeClient(
      { crowdStateMinIntervalMs: 1_000 },
      { fetch: fetchImpl, sleep: async () => undefined, now: () => clock },
    )
    // First update outside any window: sent immediately.
    const first = await client.sendCrowdStateUpdate([metric], { eventId: 7, timestamp: "t1" })
    expect(first.status).toBe("sent")
    expect(calls).toHaveLength(1)

    // Second update inside the window: pending (flushes as t3's successor resolves it).
    clock += 100
    const secondPromise = client.sendCrowdStateUpdate([metric], { eventId: 7, timestamp: "t2" })

    // Third update still inside the same window: SUPERSEDES the pending t2 —
    // t2 is never POSTed; only the latest snapshot goes out on flush.
    clock += 100
    const third = await client.sendCrowdStateUpdate([metric], { eventId: 7, timestamp: "t3" })
    expect(third.status).toBe("sent")
    expect((await secondPromise).status).toBe("superseded")

    // Exactly one POST per window, carrying the LATEST payload.
    expect(calls).toHaveLength(2)
    const bodies = calls.map((call) => JSON.parse(call.init?.body ?? "{}"))
    expect(bodies[0].timestamp).toBe("t1")
    expect(bodies[1].timestamp).toBe("t3")
  })
})

describe("P1 engine behavior is unchanged by the transport", () => {
  it("serializeSimulationResult output is untouched by transport construction", async () => {
    const { runSandbox, serializeSimulationResult } = await import("../../engine/src/index")
    const graphInput = {
      nodes: [
        { id: "A", label: "Entry", type: "ENTRANCE" as const, capacity: 100, status: "OPEN" as const },
        { id: "C", label: "Exit", type: "EXIT" as const, capacity: 100, status: "OPEN" as const },
      ],
      edges: [
        { id: "AC", from: "A", to: "C", distance: 10, baselineTime: 10, currentTime: 10, capacity: 60, status: "OPEN" as const },
      ],
    }
    const crowd = [{ id: "g1", population: 10, currentLocation: { kind: "NODE" as const, id: "A" }, destination: "C" }]
    const first = serializeSimulationResult(runSandbox({ graph: graphInput, crowd, parameters: { durationSeconds: 10, timestepSeconds: 10 } }))
    const second = serializeSimulationResult(runSandbox({ graph: graphInput, crowd, parameters: { durationSeconds: 10, timestepSeconds: 10 } }))
    expect(second).toEqual(first) // deterministic, unaffected by transport
    expect(first.id).toBe("SIMULATION_RESULT_BASELINE")
  })
})

describe("auth configuration hygiene", () => {
  it("never hard-codes a secret in the config module", async () => {
    const source = await import("../../integration/transport/p3Config.ts?raw")
    expect(source.default).not.toMatch(/P3_API_KEY\s*=\s*["']/)
    expect(source.default).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{8,}/)
  })

  it("configFromEnv requires an explicit P3_BASE_URL and never invents one", async () => {
    const { configFromEnv } = await import("../../integration/transport/p3Config")
    expect(() => configFromEnv({})).toThrow(/P3_BASE_URL/)
    const config = configFromEnv({ P3_BASE_URL: "http://p3.test:8000/", P3_API_KEY: "k" })
    expect(config.baseUrl).toBe("http://p3.test:8000")
    expect(config.apiKey).toBe("k")
  })
})
