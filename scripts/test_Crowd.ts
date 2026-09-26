import { createHash } from "node:crypto"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { writeFile } from "node:fs/promises"
import {
  compareScenarios,
  runSandbox,
  serializeSimulationResult,
} from "../src/engine/index"
import type { Disruption, SandboxInput, SimulationResult, VenueGraphInput } from "../src/engine/types"

const START = "2026-09-24T00:00:00Z"

const graph: VenueGraphInput = {
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

function scenarioInput(name: string, population: number, disruptions: Disruption[] = []): SandboxInput {
  return {
    graph,
    crowd: [{
      id: "CROWD_001",
      population,
      currentLocation: { kind: "NODE", id: "ENTRY" },
      destination: "EXIT",
      averageSpeed: 1,
      routeFlexibility: "FLEXIBLE",
      preferredRoute: ["ENTRY_HALL", "HALL_GATE", "GATE_EXIT"],
    }],
    disruptions,
    parameters: {
      durationSeconds: 120,
      timestepSeconds: 10,
      simulatedStartTime: START,
      seed: 42,
    },
    scenario: {
      id: `SCENARIO_${name.toUpperCase()}`,
      name,
      baseline: "CURRENT_GRAPH",
      startTime: START,
      duration: 120,
      stepSeconds: 10,
    },
  }
}

function preset(choice: string): SandboxInput | null {
  switch (choice.toLowerCase()) {
    case "1":
    case "normal": return scenarioInput("normal", 3)
    case "2":
    case "heavy": return scenarioInput("heavy", 1000)
    case "3":
    case "blocked": return scenarioInput("blocked", 500, [{
      id: "DISRUPTION_001", type: "BLOCKED_CORRIDOR", affectedEdges: ["HALL_GATE"],
      status: "DETECTED", startTime: "2026-09-24T00:00:20Z", expectedDuration: 60, severity: "HIGH", source: "SIMULATION",
    }])
    case "4":
    case "gate-failure": return scenarioInput("gate-failure", 500, [{
      id: "DISRUPTION_002", type: "REDUCED_CAPACITY", affectedNodes: ["GATE"],
      capacity: 10, status: "DETECTED", startTime: START, severity: "HIGH", source: "SIMULATION",
    }])
    case "5":
    case "rerouting": return scenarioInput("rerouting", 500, [{
      id: "DISRUPTION_003", type: "BLOCKED_CORRIDOR", affectedEdges: ["HALL_GATE"],
      status: "DETECTED", startTime: START, expectedDuration: 120, severity: "HIGH", source: "SIMULATION",
    }])
    case "7":
    case "step-by-step": return scenarioInput("step-by-step", 3)
    default: return null
  }
}

function bar(value: number, capacity: number | null): string {
  if (capacity === null) return "N/A — no configured capacity"
  const ratio = capacity === 0 ? 0 : Math.max(0, Math.min(1, value / capacity))
  const width = 20
  return `${"#".repeat(Math.round(ratio * width))}${"-".repeat(width - Math.round(ratio * width))} ${(ratio * 100).toFixed(0)}%`
}

function displayResult(result: SimulationResult): void {
  const metrics = result.final.nodeMetrics
  console.log("\n=== SIMULATION RESULT ===")
  console.log(`Scenario: ${result.scenarioId}  Status: ${result.status}`)
  console.log(`Initial population: ${result.metrics.population + result.arrivedPopulation}`)
  console.log(`Completed: ${result.arrivedPopulation}  Remaining: ${result.finalState.population}  Stranded: ${result.strandedPopulation}`)
  console.log(`Peak queue: ${result.metrics.peakQueue}  Peak congestion: ${result.metrics.peakCongestion.toFixed(3)}`)
  console.log(`Average travel: ${result.metrics.travelTime.toFixed(2)}s  Estimated delay: ${result.estimatedDelaySeconds.toFixed(2)}s`)
  console.log(`Bottlenecks: ${result.bottlenecks.join(", ") || "none"}`)
  console.log("\nCAPACITY")
  for (const metric of metrics) {
    console.log(`${metric.id.padEnd(10)} ${String(metric.currentOccupancy).padStart(5)} / ${String(metric.operationalCapacity ?? "N/A").padEnd(5)} ${bar(metric.currentOccupancy, metric.operationalCapacity)} queue=${metric.queueSize}`)
  }
  console.log("\nEVENT TIMELINE")
  for (const event of result.events) console.log(`${event.simTime} ${event.type} ${event.targetId ?? ""}`.trim())
  if (result.warnings.length > 0) console.log(`\nWARNINGS\n${result.warnings.map((warning) => `${warning.code}: ${warning.message}`).join("\n")}`)
}

function displaySteps(result: SimulationResult): void {
  console.log("\nSTEP-BY-STEP STATE")
  for (const [index, step] of result.steps.entries()) {
    console.log(`\nSTEP ${index} t=${step.timeSeconds}s`)
    console.log("NODES")
    for (const metric of step.nodeMetrics) {
      console.log(`  ${metric.id.padEnd(12)} ${metric.currentOccupancy}`)
    }
    console.log("TRANSIT / EDGES")
    for (const metric of step.edgeMetrics) {
      console.log(`  ${metric.id.padEnd(12)} occupancy=${metric.currentOccupancy} flow=${metric.flow.toFixed(2)} queue=${metric.queueSize} utilization=${metric.utilization === null ? "N/A" : metric.utilization.toFixed(3)}`)
    }
    console.log("CROWD GROUPS")
    for (const group of step.crowd) {
      const location = `${group.currentLocation.kind}:${group.currentLocation.id}`
      console.log(`  ${group.id} population=${group.population} location=${location} state=${group.state} progress=${group.progress.toFixed(3)} travel=${group.travelTime.toFixed(2)}s`)
    }
  }

  console.log("\nTRAVEL TIME")
  console.log(`  Spawn/start time: ${result.simulatedStartTime}`)
  const arrivalEvents = result.events.filter((event) => event.type === "ARRIVAL")
  if (arrivalEvents.length === 0) {
    console.log("  Arrival time: N/A — no arrival event")
  } else {
    for (const event of arrivalEvents) {
      const arrivalStep = result.steps.find((step) => step.crowd.some((group) =>
        (group.sourceId ?? group.id) === event.targetId && group.state === "ARRIVED"))
      const group = arrivalStep?.crowd.find((candidate) => (candidate.sourceId ?? candidate.id) === event.targetId)
      console.log(`  ${event.targetId ?? "GROUP"} arrival time: ${event.simTime}`)
      console.log(`  ${event.targetId ?? "GROUP"} computed travel time: ${group ? `${group.travelTime.toFixed(2)}s` : "N/A — not provided by arrival snapshot"}`)
    }
  }
}

function stablePayload(result: SimulationResult): string {
  return JSON.stringify(serializeSimulationResult(result))
}

async function determinism(inputScenario: SandboxInput): Promise<void> {
  const first = runSandbox(inputScenario)
  const second = runSandbox(inputScenario)
  const firstPayload = stablePayload(first)
  const secondPayload = stablePayload(second)
  const hash = (value: string) => createHash("sha256").update(value).digest("hex")
  console.log(`\nDETERMINISM CHECK\nRun 1: ${hash(firstPayload)}\nRun 2: ${hash(secondPayload)}\nResult: ${firstPayload === secondPayload ? "PASS" : "FAIL"}`)
}

async function customScenario(rl: ReturnType<typeof createInterface>): Promise<SandboxInput> {
  const population = await numberPrompt(rl, "Population", 100)
  const duration = await numberPrompt(rl, "Duration seconds", 120)
  const capacity = await numberPrompt(rl, "Gate capacity", 30)
  return {
    ...scenarioInput("custom", population),
    graphOverrides: [{ scope: "EDGE", targetId: "GATE_EXIT", capacity }],
    parameters: { durationSeconds: duration, timestepSeconds: 10, simulatedStartTime: START, seed: 42 },
    scenario: { ...scenarioInput("custom", population).scenario!, duration, stepSeconds: 10 },
  }
}

async function numberPrompt(rl: ReturnType<typeof createInterface>, label: string, fallback: number): Promise<number> {
  const value = Number((await rl.question(`${label} [${fallback}]: `)).trim() || fallback)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be >= 0`)
  return value
}

async function runStress(): Promise<void> {
  console.log("\nPOPULATION | COMPLETED | REMAINING | STRANDED | PEAK_QUEUE | AVG_TRAVEL")
  for (const population of [100, 250, 500, 1000, 2000, 5000]) {
    const result = runSandbox(scenarioInput(`stress-${population}`, population))
    console.log(`${String(population).padStart(10)} | ${String(result.arrivedPopulation).padStart(9)} | ${String(result.finalState.population).padStart(9)} | ${String(result.strandedPopulation).padStart(8)} | ${String(result.metrics.peakQueue).padStart(10)} | ${result.metrics.travelTime.toFixed(2).padStart(10)}`)
  }
}

async function main(): Promise<void> {
  const command = process.argv[2]?.toLowerCase()
  if (command === "--stress") {
    await runStress()
    return
  }
  if (command === "--determinism") {
    await determinism(preset("1")!)
    return
  }
  if (command === "--scenario") {
    const result = runSandbox(preset(process.argv[3] ?? "1") ?? scenarioInput("normal", 100))
    displayResult(result)
    if (process.argv.includes("--export")) await writeFile("test_Crowd.latest.json", JSON.stringify(serializeSimulationResult(result), null, 2), "utf8")
    return
  }
  if (command === "--compare") {
    const comparison = compareScenarios([scenarioInput("normal", 500), scenarioInput("blocked", 500, [{
      id: "DISRUPTION_COMPARE", type: "BLOCKED_CORRIDOR", affectedEdges: ["HALL_GATE"],
      status: "DETECTED", startTime: START, expectedDuration: 120, severity: "HIGH", source: "SIMULATION",
    }])])
    console.table(comparison.impact)
    return
  }
  const rl = createInterface({ input, output })
  try {
    let latest: SimulationResult | null = null
    for (;;) {
      console.log("\n╔══════════════════════════════════════════╗\n║       EVENTFLOW CROWD SIMULATOR          ║\n╠══════════════════════════════════════════╣\n║ 1 Normal  2 Heavy Crowd  3 Blocked       ║\n║ 4 Gate Failure  5 Rerouting  6 Stress     ║\n║ 7 Step-by-Step  8 Custom  9 Compare       ║\n║ D Determinism  E Export  0 Exit           ║\n╚══════════════════════════════════════════╝")
      const choice = (await rl.question("Select: ")).trim().toUpperCase()
      if (choice === "0") break
      if (choice === "6") { await runStress(); continue }
      if (choice === "D" && latest) { await determinism(presetForResult(latest)); continue }
      if (choice === "E" && latest) {
        await writeFile("test_Crowd.latest.json", JSON.stringify(serializeSimulationResult(latest), null, 2), "utf8")
        console.log("Exported test_Crowd.latest.json")
        continue
      }
      if (choice === "8") {
        try { latest = runSandbox(await customScenario(rl)); displayResult(latest) } catch (error) { console.log(`Input error: ${error instanceof Error ? error.message : String(error)}`) }
        continue
      }
      if (choice === "9") {
        const comparison = compareScenarios([scenarioInput("normal", 500), scenarioInput("blocked", 500, [{ id: "DISRUPTION_COMPARE", type: "BLOCKED_CORRIDOR", affectedEdges: ["HALL_GATE"], status: "DETECTED", startTime: START, expectedDuration: 120, severity: "HIGH", source: "SIMULATION" }])])
        console.table(comparison.impact)
        continue
      }
      if (choice === "D") { console.log("Run a scenario first."); continue }
      if (choice === "E") { console.log("Run a scenario first."); continue }
      const selected = preset(choice)
      if (!selected) { console.log("Unknown menu option."); continue }
      latest = runSandbox(selected)
      displayResult(latest)
      if (choice === "7") displaySteps(latest)
    }
  } finally {
    rl.close()
  }
}

function presetForResult(result: SimulationResult): SandboxInput {
  return preset(result.scenarioId.replace("SCENARIO_", "").toLowerCase()) ?? scenarioInput("determinism", result.metrics.population + result.arrivedPopulation)
}

if (process.argv[1]?.endsWith("test_Crowd.ts")) void main()
