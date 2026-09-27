/**
 * E2E driver — executes the REAL P1 engine and the REAL P1→P3 transport
 * on behalf of backend/tests/test_p1_e2e_real.py (which spawns the real
 * FastAPI server on an ephemeral port). Invoked by the Python test as:
 *
 *   node node_modules/tsx/dist/cli.mjs integration/runner/e2eDriver.mjs <mode>
 *   stdin:  JSON { baseUrl, apiKey, eventId, strategySetId?|occupancy? }
 *   stdout: JSON { envelope, push: P3SendResult }
 *
 * Modes:
 * - "simulation": builds the SandboxInput from the payload, runs the real
 *   deterministic engine (engine/src), serializes with P1's own serializer
 *   and pushes the COMPLETED result through the real P3Client.
 * - "crowd": computes real CapacityMetrics with P1's `capacityMetric` over
 *   the supplied observed occupancies and pushes the snapshot through the
 *   real P3Client (throttled, latest-wins — exactly like production).
 *
 * This file deliberately contains NO test framework and NO fake data path:
 * it is the same boundary scripts/pushToP3.ts uses in production.
 */
import {
  capacityMetric,
  runSandbox,
  serializeMetric,
  serializeSimulationResult,
} from "../../engine/src/index"
import type { CapacityMetric, SandboxInput } from "../../engine/src/types"
import { P3Client } from "../transport/p3Client"

type DriverPayload = {
  baseUrl: string
  apiKey?: string
  eventId: number
  strategySetId?: number
  scenarioId?: string
  nodeIds?: Record<string, number>
  occupancy?: Record<string, number>
}

/** Graph input mirroring the event seeded through the P3 API (external ids). */
function buildInput(payload: DriverPayload): SandboxInput {
  const nodeIds = payload.nodeIds ?? { ENTRY: 1, HALL: 2, EXIT: 3 }
  const idOf = (p1: string): string =>
    Object.keys(nodeIds).includes(p1) ? p1 : String(nodeIds[p1])
  return {
    graph: {
      nodes: [
        { id: idOf("ENTRY"), label: "Main Entrance", type: "GATE", capacity: 5000, status: "OPEN" },
        { id: idOf("HALL"), label: "Concert Hall", type: "ZONE", capacity: 300, throughputCapacity: 120, status: "OPEN" },
        { id: idOf("EXIT"), label: "South Exit", type: "GATE", capacity: 5000, status: "OPEN" },
      ],
      edges: [
        { id: "ENTRY_HALL", from: idOf("ENTRY"), to: idOf("HALL"), distance: 20, baselineTime: 20, capacity: 120, status: "OPEN" },
        { id: "HALL_EXIT", from: idOf("HALL"), to: idOf("EXIT"), distance: 20, baselineTime: 20, capacity: 120, status: "OPEN" },
      ],
      // GATE is a valid P1 entry AND exit type (engine/src/graph.ts).
      activeEntries: [idOf("ENTRY")],
      activeExits: [idOf("EXIT")],
    },
    crowd: [
      {
        id: "CROWD_001",
        population: 150,
        currentLocation: { kind: "NODE", id: idOf("ENTRY") },
        destination: idOf("EXIT"),
        averageSpeed: 1,
        routeFlexibility: "FLEXIBLE",
      },
    ],
    parameters: { durationSeconds: 60, timestepSeconds: 10, seed: 42 },
    scenario: {
      id: payload.scenarioId ?? `STRATEGY_SET_${payload.strategySetId ?? 0}`,
      name: "E2E real integration scenario",
      baseline: "CURRENT_GRAPH",
      startTime: new Date().toISOString(),
      duration: 60,
      stepSeconds: 10,
    },
  }
}

async function runSimulation(payload: DriverPayload): Promise<string> {
  const result = runSandbox(buildInput(payload))
  if (result.status !== "COMPLETED") {
    throw new Error(`engine returned ${result.status}; the E2E requires a completed run`)
  }
  const envelope = {
    strategy_set_id: payload.strategySetId,
    result: serializeSimulationResult(result),
  }
  const client = new P3Client({
    baseUrl: payload.baseUrl,
    apiKey: payload.apiKey,
    timeoutMs: 30_000,
    maxAttempts: 2,
    backoffBaseMs: 100,
    backoffMaxMs: 500,
    crowdStateMinIntervalMs: 0,
    queueBackend: "memory",
    queueFilePath: "",
  })
  const push = await client.sendSimulationResult(result, {
    strategySetId: payload.strategySetId ?? 0,
  })
  if (push.status !== "sent") {
    throw new Error(`transport did not deliver: ${JSON.stringify(push)}`)
  }
  return JSON.stringify({ envelope, push })
}

async function runCrowd(payload: DriverPayload): Promise<string> {
  const input = buildInput(payload)
  const occupancy = payload.occupancy ?? {}
  const metrics: CapacityMetric[] = input.graph.nodes.map((node) =>
    capacityMetric(
      node,
      occupancy[node.id] ?? 0,
      0, // no interval transfer data in a manual snapshot — honest zeros
      0,
    ),
  )
  const envelope = {
    event_id: payload.eventId,
    timestamp: new Date().toISOString(),
    metrics: metrics.map(serializeMetric),
  }
  const client = new P3Client({
    baseUrl: payload.baseUrl,
    apiKey: payload.apiKey,
    timeoutMs: 30_000,
    maxAttempts: 2,
    backoffBaseMs: 100,
    backoffMaxMs: 500,
    crowdStateMinIntervalMs: 0,
    queueBackend: "memory",
    queueFilePath: "",
  })
  const push = await client.sendCrowdStateUpdate(metrics, {
    eventId: payload.eventId,
    timestamp: envelope.timestamp,
  })
  if (push.status !== "sent") {
    throw new Error(`transport did not deliver: ${JSON.stringify(push)}`)
  }
  return JSON.stringify({ envelope, push })
}

async function main(): Promise<void> {
  const mode = process.argv[2]
  const raw = await new Promise<string>((resolve, reject) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => (data += chunk))
    process.stdin.on("end", () => resolve(data))
    process.stdin.on("error", reject)
  })
  const payload = JSON.parse(raw) as DriverPayload
  if (mode === "simulation") {
    process.stdout.write(await runSimulation(payload))
    return
  }
  if (mode === "crowd") {
    process.stdout.write(await runCrowd(payload))
    return
  }
  throw new Error(`unknown driver mode: ${mode}`)
}

main().catch((error) => {
  console.error(`[e2eDriver] ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  process.exit(1)
})
