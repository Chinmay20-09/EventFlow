/**
 * Runtime P1 → P3 connection runner (the missing link, wired end-to-end).
 *
 * P1 stays a pure calculation library; this script is the ONLY place where
 * the engine meets the network. It demonstrates the two meaningful engine
 * boundaries from the integration requirements:
 *
 *   1. A completed simulation result  -> POST /api/internal/simulations
 *   2. A current crowd-state snapshot -> POST /api/internal/crowd-state
 *
 * Usage (all config via environment or a local `.env` — see
 * src/transport/README.md):
 *
 *   # Run a scenario and push the completed simulation result:
 *   npm run push:p3 -- --scenario normal --strategy-set-id 3
 *
 *   # Push one live crowd-state snapshot from observed occupancies:
 *   npm run push:p3 -- --live live.json
 *   # live.json: { "event_id": 1, "occupancy": { "ENTRY": 120, "HALL": 90 } }
 *
 *   # Replay payloads queued during a P3 outage:
 *   npm run push:p3 -- --retry-queue
 *
 * The script NEVER invents `event_id` / `strategy_set_id` (unresolved P1→P3
 * mapping — backend/IMPLEMENTATION_NOTES.md §7): they must be passed
 * explicitly. Failures are retried with backoff, then queued locally; the
 * script never crashes because P3 is down.
 */
import { readFileSync } from "node:fs"
import { capacityMetric, runSandbox, VenueGraph } from "../src/engine/index"
import type { CapacityMetric, SandboxInput } from "../src/engine/types"
import { P3Client } from "../src/transport/p3Client"

/** Load a local `.env` if present (same convention as the P3 backend). */
try {
  process.loadEnvFile()
} catch {
  /* no .env file — environment variables only */
}

const venueGraphInput: SandboxInput["graph"] = {
  nodes: [
    { id: "ENTRY", label: "Entry", type: "ENTRANCE", capacity: 5000, throughputCapacity: null, status: "OPEN" },
    { id: "HALL", label: "Hall", type: "ZONE", capacity: 300, throughputCapacity: 120, status: "OPEN" },
    { id: "GATE", label: "Gate", type: "CHECKPOINT", capacity: 80, throughputCapacity: 30, status: "OPEN" },
    { id: "ALT", label: "Alternate", type: "CORRIDOR", capacity: 150, throughputCapacity: 90, status: "OPEN" },
    { id: "EXIT", label: "Exit", type: "EXIT", capacity: 5000, throughputCapacity: null, status: "OPEN" },
  ],
  edges: [
    { id: "ENTRY_HALL", from: "ENTRY", to: "HALL", distance: 20, baselineTime: 20, currentTime: 20, capacity: 120, status: "OPEN" },
    { id: "HALL_GATE", from: "HALL", to: "GATE", distance: 20, baselineTime: 20, currentTime: 20, capacity: 30, status: "OPEN" },
    { id: "GATE_EXIT", from: "GATE", to: "EXIT", distance: 20, baselineTime: 20, currentTime: 20, capacity: 30, status: "OPEN" },
    { id: "HALL_ALT", from: "HALL", to: "ALT", distance: 35, baselineTime: 35, currentTime: 35, capacity: 90, status: "OPEN" },
    { id: "ALT_EXIT", from: "ALT", to: "EXIT", distance: 35, baselineTime: 35, currentTime: 35, capacity: 90, status: "OPEN" },
  ],
  activeEntries: ["ENTRY"],
  activeExits: ["EXIT"],
}

function scenarioInput(name: string, population: number): SandboxInput {
  return {
    graph: venueGraphInput,
    crowd: [{
      id: "CROWD_001",
      population,
      currentLocation: { kind: "NODE", id: "ENTRY" },
      destination: "EXIT",
      averageSpeed: 1,
      routeFlexibility: "FLEXIBLE",
      preferredRoute: ["ENTRY_HALL", "HALL_GATE", "GATE_EXIT"],
    }],
    parameters: { durationSeconds: 120, timestepSeconds: 10, simulatedStartTime: "2026-09-24T00:00:00Z", seed: 42 },
    scenario: {
      id: `SCENARIO_${name.toUpperCase()}`, name, baseline: "CURRENT_GRAPH",
      startTime: "2026-09-24T00:00:00Z", duration: 120, stepSeconds: 10,
    },
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

/** Live crowd-state boundary: P1's own `capacityMetric` over observed counts. */
function liveMetrics(occupancy: Record<string, number>): CapacityMetric[] {
  const graph = new VenueGraph(venueGraphInput)
  return graph.nodes.map((node) => capacityMetric(
    node,
    occupancy[node.id] ?? 0,
    0, // no interval transfer data in a manual snapshot — honest zeros
    0,
  ))
}

async function main(): Promise<void> {
  const client = new P3Client((await import("../src/transport/p3Config")).configFromEnv())
  const command = process.argv[2]

  if (command === "--retry-queue") {
    const report = await client.retryQueued()
    console.log(`[pushToP3] queue replay: delivered=${report.delivered} remaining=${report.remaining}`)
    return
  }

  if (command === "--live") {
    const eventId = Number(argument("event-id") ?? "")
    if (!Number.isInteger(eventId) || eventId <= 0) {
      throw new Error("--event-id <int> is required for --live (P3 event_id cannot be derived from P1 data)")
    }
    const file = argument("live")
    if (!file) throw new Error("--live <file> is required")
    const occupancy = JSON.parse(readFileSync(file, "utf8")) as { event_id?: number; occupancy: Record<string, number> }
    const result = await client.sendCrowdStateUpdate(liveMetrics(occupancy.occupancy), {
      eventId,
      timestamp: new Date().toISOString(),
    })
    console.log(`[pushToP3] crowd-state: ${result.status}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}`)
    return
  }

  if (command === "--scenario") {
    const name = argument("scenario") ?? "normal"
    const strategySetId = Number(argument("strategy-set-id") ?? "")
    const population = Number(argument("population") ?? 100)
    if (!Number.isInteger(strategySetId) || strategySetId <= 0) {
      console.error(
        "[pushToP3] --strategy-set-id <int> is required to push a simulation result.\n" +
          "P1's strategyId/scenarioId are opaque strings with no established mapping to\n" +
          "P3 integer strategy_set_ids (IMPLEMENTATION_NOTES §7) — the link must be made\n" +
          "explicitly, never guessed. Run the simulation without the flag to compute only.",
      )
    }
    const result = runSandbox(scenarioInput(name, population))
    console.log(`[pushToP3] simulation ${result.id} (${result.scenarioId}) completed: arrived=${result.arrivedPopulation}`)
    if (!Number.isInteger(strategySetId) || strategySetId <= 0) return
    const sent = await client.sendSimulationResult(result, { strategySetId })
    console.log(`[pushToP3] simulation push: ${sent.status}${sent.httpStatus ? ` (HTTP ${sent.httpStatus})` : ""}`)
    return
  }

  console.log(
    "Usage:\n" +
      "  npm run push:p3 -- --scenario <name> --strategy-set-id <int> [--population <int>]\n" +
      "  npm run push:p3 -- --live <file> --event-id <int>\n" +
      "  npm run push:p3 -- --retry-queue",
  )
}

if (process.argv[1]?.endsWith("pushToP3.ts")) void main()
