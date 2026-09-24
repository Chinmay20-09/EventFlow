import { VenueGraph } from "./graph"
import { findPath } from "./pathfinding"
import { runSandbox } from "./sandbox"
import type {
  CandidateEvaluation, OptimizationCandidate, OptimizationInput, OptimizationResult,
  OptimizationWeights, SandboxInput, StrategySolver,
} from "./types"
import type { CrowdGroupInput, SimulationParameters } from "./types"

type OptimizationRunInput = OptimizationInput & { crowd: CrowdGroupInput[]; parameters?: Partial<SimulationParameters> }

export const DEFAULT_OPTIMIZATION_WEIGHTS: OptimizationWeights = {
  congestion: 0.25,
  queueSize: 0.25,
  waitingTime: 0.25,
  travelTime: 0.15,
  throughput: 0.1,
}

export class DeterministicFallbackSolver implements StrategySolver {
  generate(input: OptimizationInput): OptimizationCandidate[] {
    return generateCandidates(input)
  }
}

/**
 * Generates bounded one-lever candidates. This is intentionally a solver
 * boundary, not a claim of OR-Tools integration. Evaluation and ranking happen
 * separately in optimizeSimulation.
 */
export function generateCandidates(input: OptimizationInput): OptimizationCandidate[] {
  const locked = new Set(input.disruptionLocked ?? [])
  const changes: OptimizationCandidate["changes"] = []
  if (input.allowNodeCapacityChange) {
    for (const node of input.graph.nodes.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (locked.has(node.id) || node.capacity === null) continue
      const minimum = input.minimumCapacity?.[node.id] ?? 0
      if (minimum >= 0 && minimum < (node.operationalCapacity ?? node.capacity)) {
        changes.push({ scope: "NODE", targetId: node.id, parameter: "capacity", previousValue: node.operationalCapacity ?? node.capacity, proposedValue: minimum })
      }
    }
  }
  if (input.allowEdgeCapacityChange) {
    for (const edge of input.graph.edges.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (locked.has(edge.id) || edge.capacity === null) continue
      const minimum = input.minimumCapacity?.[edge.id] ?? 0
      if (minimum >= 0 && minimum < (edge.operationalCapacity ?? edge.capacity)) {
        changes.push({ scope: "EDGE", targetId: edge.id, parameter: "capacity", previousValue: edge.operationalCapacity ?? edge.capacity, proposedValue: minimum })
      }
    }
  }
  if (input.allowThroughputChange) {
    for (const node of input.graph.nodes.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (locked.has(node.id) || node.throughputCapacity === null || node.throughputCapacity === undefined) continue
      const minimum = input.minimumThroughput?.[node.id] ?? 0
      if (minimum >= 0 && minimum < node.throughputCapacity) {
        changes.push({ scope: "NODE", targetId: node.id, parameter: "throughput_capacity", previousValue: node.throughputCapacity, proposedValue: minimum })
      }
    }
  }
  const max = Math.max(1, input.maxCandidates ?? changes.length + 1)
  return [
    { id: "CANDIDATE_00", changes: [], feasible: true, rejectionReasons: [] },
    ...changes.slice(0, max - 1).map((change, index) => ({
      id: `CANDIDATE_${String(index + 1).padStart(2, "0")}`,
      changes: [change],
      feasible: true,
      rejectionReasons: [],
    })),
  ]
}

export function optimizeSimulation(
  input: OptimizationRunInput,
  weights: OptimizationWeights = DEFAULT_OPTIMIZATION_WEIGHTS,
  solver: StrategySolver = new DeterministicFallbackSolver(),
): OptimizationResult {
  validateWeights(weights)
  const candidates = solver.generate(input)
  const evaluations = candidates.map((candidate) => evaluateCandidate(candidate, input, weights))
  const feasible = evaluations.filter((evaluation) => evaluation.feasible && evaluation.simulation !== null)
  const rejected = evaluations.filter((evaluation) => !evaluation.feasible || evaluation.simulation === null)
  if (feasible.length === 0) {
    return { status: "NO_FEASIBLE_CANDIDATES", ranked: [], rejected, weights, solver: solver instanceof DeterministicFallbackSolver ? "DETERMINISTIC_FALLBACK" : "EXTERNAL_ADAPTER" }
  }
  const normalized = normalizeObjectives(feasible, weights)
  normalized.sort((a, b) => (a.objective ?? Number.POSITIVE_INFINITY) - (b.objective ?? Number.POSITIVE_INFINITY) || compareIds(a.candidateId, b.candidateId))
  return {
    status: "COMPLETED",
    ranked: normalized,
    rejected,
    weights,
    solver: solver instanceof DeterministicFallbackSolver ? "DETERMINISTIC_FALLBACK" : "EXTERNAL_ADAPTER",
  }
}

function evaluateCandidate(candidate: OptimizationCandidate, input: OptimizationRunInput, weights: OptimizationWeights): CandidateEvaluation {
  const rejectionReasons = validateCandidate(candidate, input)
  if (rejectionReasons.length > 0) {
    return { candidateId: candidate.id, feasible: false, rejectionReasons, objective: null, metrics: null, simulation: null }
  }
  const graph = new VenueGraph(input.graph)
  const sandbox: SandboxInput = {
    graph: graph.toJSON(),
    crowd: input.crowd,
    parameters: input.parameters,
    graphOverrides: candidate.changes.map((change) => ({
      scope: change.scope,
      targetId: change.targetId,
      ...(change.parameter === "status" ? { status: change.proposedValue as "OPEN" | "CLOSED" } : {}),
      ...(change.parameter === "capacity" ? { capacity: Number(change.proposedValue) } : {}),
      ...(change.parameter === "throughput_capacity" ? { throughputCapacity: Number(change.proposedValue) } : {}),
    })),
  }
  const simulation = runSandbox(sandbox)
  const metrics = outcomeMetrics(simulation)
  return { candidateId: candidate.id, feasible: true, rejectionReasons: [], objective: objective(metrics, weights), metrics, simulation }
}

function validateCandidate(candidate: OptimizationCandidate, input: OptimizationInput): string[] {
  const reasons: string[] = []
  const locked = new Set(input.disruptionLocked ?? [])
  for (const change of candidate.changes) {
    if (locked.has(change.targetId)) reasons.push("DISRUPTION_LOCKED")
    const entity = change.scope === "NODE"
      ? input.graph.nodes.find((node) => node.id === change.targetId)
      : input.graph.edges.find((edge) => edge.id === change.targetId)
    if (!entity) {
      reasons.push("UNKNOWN_ENTITY")
      continue
    }
    if (change.parameter === "throughput_capacity" && change.scope !== "NODE") reasons.push("INVALID_PARAMETER")
    const value = typeof change.proposedValue === "number" ? change.proposedValue : Number.NaN
    if (!Number.isFinite(value) || value < 0) reasons.push("CAPACITY_OUT_OF_BOUNDS")
    const current = change.parameter === "throughput_capacity"
      ? input.graph.nodes.find((node) => node.id === change.targetId)?.throughputCapacity
      : entity.operationalCapacity ?? entity.capacity
    if (typeof current === "number" && value > current) reasons.push("CAPACITY_OUT_OF_BOUNDS")
  }
  if (reasons.length > 0) return [...new Set(reasons)].sort(compareIds)
  const candidateGraph = new VenueGraph(input.graph).withOverrides(candidate.changes.map((change) => ({
    scope: change.scope,
    targetId: change.targetId,
    ...(change.parameter === "capacity" ? { capacity: Number(change.proposedValue) } : {}),
    ...(change.parameter === "throughput_capacity" ? { throughputCapacity: Number(change.proposedValue) } : {}),
  })))
  for (const entry of candidateGraph.activeEntries) {
    for (const exit of candidateGraph.activeExits) {
      const before = findPath(new VenueGraph(input.graph), entry, exit)
      if (before && !findPath(candidateGraph, entry, exit)) reasons.push("NO_PATH")
    }
  }
  return [...new Set(reasons)].sort(compareIds)
}

function outcomeMetrics(simulation: NonNullable<CandidateEvaluation["simulation"]>): NonNullable<CandidateEvaluation["metrics"]> {
  const peakCongestion = Math.max(0, ...simulation.steps.flatMap((step) => [
    ...step.nodeMetrics.map((metric) => metric.holdingUtilization ?? 0),
    ...step.edgeMetrics.map((metric) => metric.flowUtilization ?? 0),
  ]))
  const peakQueue = Math.max(0, ...simulation.steps.flatMap((step) => step.nodeMetrics.map((metric) => metric.queueSize)))
  const groups = simulation.final.crowd
  const population = groups.reduce((sum, group) => sum + group.population, 0)
  const waitingTime = population === 0 ? 0 : groups.reduce((sum, group) => sum + group.waitingTime * group.population, 0) / population
  const travelTime = population === 0 ? 0 : groups.reduce((sum, group) => sum + group.travelTime * group.population, 0) / population
  const throughput = simulation.durationSeconds === 0 ? 0 : simulation.arrivedPopulation / simulation.durationSeconds * 60
  return { peakCongestion, peakQueue, waitingTime, travelTime, throughput }
}

function normalizeObjectives(evaluations: CandidateEvaluation[], weights: OptimizationWeights): CandidateEvaluation[] {
  const metrics = evaluations.map((evaluation) => evaluation.metrics!)
  const ranges = {
    peakCongestion: range(metrics.map((metric) => metric.peakCongestion)),
    peakQueue: range(metrics.map((metric) => metric.peakQueue)),
    waitingTime: range(metrics.map((metric) => metric.waitingTime)),
    travelTime: range(metrics.map((metric) => metric.travelTime)),
    throughput: range(metrics.map((metric) => metric.throughput)),
  }
  return evaluations.map((evaluation) => {
    const metric = evaluation.metrics!
    const score = weights.congestion * normalize(metric.peakCongestion, ranges.peakCongestion)
      + weights.queueSize * normalize(metric.peakQueue, ranges.peakQueue)
      + weights.waitingTime * normalize(metric.waitingTime, ranges.waitingTime)
      + weights.travelTime * normalize(metric.travelTime, ranges.travelTime)
      - weights.throughput * normalize(metric.throughput, ranges.throughput)
    return { ...evaluation, objective: score }
  })
}

function objective(metrics: NonNullable<CandidateEvaluation["metrics"]>, weights: OptimizationWeights): number {
  return weights.congestion * metrics.peakCongestion
    + weights.queueSize * metrics.peakQueue
    + weights.waitingTime * metrics.waitingTime
    + weights.travelTime * metrics.travelTime
    - weights.throughput * metrics.throughput
}

function range(values: number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)]
}

function normalize(value: number, bounds: [number, number]): number {
  return bounds[1] === bounds[0] ? 0 : (value - bounds[0]) / (bounds[1] - bounds[0])
}

function validateWeights(weights: OptimizationWeights): void {
  const values = Object.values(weights)
  if (values.some((value) => value < 0) || values.every((value) => value === 0)) throw new Error("Optimization weights must be non-negative and not all zero")
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
