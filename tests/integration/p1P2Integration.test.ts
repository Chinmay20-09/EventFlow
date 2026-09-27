/**
 * P1 → P2 integration test (Task 3).
 *
 * This is NOT a unit test with a fake simulation: the real P1 engine
 * (`DeterministicSimulator`, the same entry point P2's registered tool
 * `integration/tools/p1_simulation_tool.ts::runBaselineSimulation` wraps) is executed
 * against the known-good engine graph fixture, and its authoritative result is
 * fed through P2's real pipeline:
 *
 *   P1 DeterministicSimulator.run()          (calculation — P1's job)
 *      → P1SimulationContext                 (the existing tool input type)
 *      → P2Orchestrator.process()            (intent → context → LLM → guardrails → tool)
 *      → P2 interpretation of the P1 result  (AIResponse / organizer message)
 *
 * MockLLMProvider is used only because no real LLM provider is configured in
 * the MVP; it does not stand in for P1 anywhere. Failure paths must be visible,
 * never silent (task requirement 9/10).
 */

import { describe, expect, it } from "vitest"

import { DeterministicSimulator, VenueGraph } from "../../engine/src"

import type {
  CrowdGroupInput,
  SimulationResult,
  VenueGraphInput,
} from "../../engine/src/types"

import { P2Orchestrator } from "../../strategy/src/ai/p2_orchestrator"
import { MockLLMProvider } from "../../strategy/src/ai/llm"
import type { P1SimulationContext } from "../../integration/tools/p1_simulation_tool"
import { runBaselineSimulation } from "../../integration/tools/p1_simulation_tool"

// ---------------------------------------------------------------
// Real graph + crowd fixtures (same shapes the engine tests use).
// Node B is deliberately undersized (capacity 50, throughput 60)
// with a 200-person crowd, so P1 deterministically reports a
// bottleneck at B/BC.
// ---------------------------------------------------------------

const graphInput: VenueGraphInput = {
  nodes: [
    { id: "A", label: "Entry", type: "ENTRANCE", capacity: 100, throughputCapacity: null, status: "OPEN" },
    { id: "B", label: "Concourse", type: "ZONE", capacity: 50, throughputCapacity: 60, status: "OPEN" },
    { id: "C", label: "Exit", type: "EXIT", capacity: 100, throughputCapacity: null, status: "OPEN" },
  ],
  edges: [
    { id: "AB", from: "A", to: "B", distance: 10, baselineTime: 10, currentTime: 10, capacity: 60, status: "OPEN" },
    { id: "BC", from: "B", to: "C", distance: 10, baselineTime: 10, currentTime: 10, capacity: 60, status: "OPEN" },
  ],
}

const crowd: CrowdGroupInput[] = [
  {
    id: "group-1",
    population: 200,
    currentLocation: { kind: "NODE", id: "A" },
    destination: "C",
    averageSpeed: 1,
  },
]

/** P1's real engine entry point (identical construction to P2's registered tool). */
function runP1Engine(context: P1SimulationContext): SimulationResult {
  return new DeterministicSimulator(
    context.graph,
    context.groups,
    context.parameters ?? {},
    context.graphAtTime,
  ).run()
}

describe("P1 → P2 integration (real engine, no simulated P1)", () => {
  it("P2 consumes an authoritative P1 result end-to-end", async () => {
    // 1. P1 runs the deterministic simulation and produces its result.
    //    `P1SimulationContext.graph` is a VenueGraph instance — the exact type
    //    P2's registered tool forwards to DeterministicSimulator.
    const p1Context: P1SimulationContext = {
      graph: new VenueGraph(graphInput),
      groups: crowd,
      parameters: { durationSeconds: 60, timestepSeconds: 10, simulatedStartTime: "2026-09-24T00:00:00Z", seed: 42 },
    }
    const p1Result = runP1Engine(p1Context)

    // P1 really calculated: COMPLETED with the bottleneck it was set up to find.
    expect(p1Result.status).toBe("COMPLETED")
    expect(p1Result.metrics.arrivedPopulation).toBeGreaterThan(0)
    expect(p1Result.bottlenecks.length).toBeGreaterThan(0)

    // 2. P2 receives the P1 result through its real orchestrator pipeline.
    const orchestrator = new P2Orchestrator(new MockLLMProvider()) // LLM only; P1 remains real
    const outcome = await orchestrator.process({
      organizer_request: "Why is the crowd so congested near G1?",
      p1_context: p1Context,
      event: { event_id: "event-1", event_name: "Mumbai Music Festival", organizer_request: "Why is the crowd so congested near G1?" },
    })

    // 3. The orchestrator actually invoked the P1 tool and stored its result.
    expect(outcome.success).toBe(true)
    expect(outcome.intent).toBe("analyze_congestion")
    expect(outcome.context?.p1_state?.simulation).toBeDefined()
    expect(outcome.context?.tool_results[0]?.tool_name).toBe("run_baseline_simulation")
    expect(outcome.context?.tool_results[0]?.success).toBe(true)

    // 4. P2's message is derived from the same P1 numbers (bottlenecks) —
    //    no invented metrics, no fabricated authority claims.
    expect(outcome.response).toContain("simulation completed successfully")
    expect(outcome.response).toContain("bottleneck")
    expect(outcome.response).toContain("Execution status: not_executed")
  })

  it("P1 failure is visible through P2 — never silent", async () => {
    // Broken P1 context: an edge references a node that does not exist, so the
    // real engine throws. This raw input is exactly what the tool receives —
    // the failure happens inside the real P1 construction path.
    const brokenContext: P1SimulationContext = {
      graph: {
        nodes: [{ id: "A", label: "Entry", type: "ENTRANCE", capacity: 100, throughputCapacity: null, status: "OPEN" }],
        edges: [{ id: "AB", from: "A", to: "MISSING", distance: 10, baselineTime: 10, currentTime: 10, capacity: 60, status: "OPEN" }],
      } as unknown as VenueGraphInput,
      groups: crowd,
      parameters: { durationSeconds: 30, timestepSeconds: 10 },
    }

    // The registered P1 tool reports the failure instead of fabricating data.
    const toolResult = runBaselineSimulation({ context: brokenContext })
    expect(toolResult.success).toBe(false)
    expect(toolResult.error).toBeTruthy()
    expect(toolResult.data).toBeUndefined()

    // The orchestrator surfaces the failure to the caller (requirement 10).
    const orchestrator = new P2Orchestrator(new MockLLMProvider())
    const outcome = await orchestrator.process({
      organizer_request: "Identify the bottleneck near G1",
      p1_context: brokenContext,
    })

    expect(outcome.success).toBe(false)
    expect(outcome.response).toBeTruthy()
    expect(outcome.error).toBeTruthy()
  })
})
