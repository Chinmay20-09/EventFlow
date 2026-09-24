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
  solve(input: OptimizationInput): OptimizationCandidate[] {
    return generateCandidates(input)
  }
}

/**
 * Generates bounded one-lever candidates. This is intentionally a solver
 * boundary, not a claim of OR-Tools integration. Evaluation and ranking happen
 * separately in optimizeSimulation.
 */
export function generateCandidates(input: OptimizationInput): OptimizationCandidate[] {
  const locked = new Set([...(input.disruptionLocked ?? []), ...(input.operatorLocked ?? []), ...(input.excludedEntities ?? [])])
  const changes: OptimizationCandidate["changes"] = []
  if (input.allowStatusChange) {
    for (const node of input.graph.nodes.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (locked.has(node.id) || (input.controllableNodes && !input.controllableNodes.includes(node.id))) continue
      changes.push({ scope: "NODE", targetId: node.id, parameter: "status", previousValue: node.status ?? "OPEN", proposedValue: node.status === "OPEN" ? "CLOSED" : "OPEN" })
    }
    if (input.allowDemandRebalancing) {
      const entries = (input.graph.activeEntries ?? []).slice().sort(compareIds)
      const shares = entries.map((id) => input.demandShares?.[id] ?? (entries.length === 0 ? 0 : 1 / entries.length))
      const equalShares = entries.length === 0 ? [] : entries.map(() => 1 / entries.length)
      if (entries.length > 0 && shares.some((share, index) => Math.abs(share - equalShares[index]) > 1e-9)) {
        entries.forEach((id, index) => changes.push({
          scope: "NODE", targetId: id, parameter: "demand_share",
          previousValue: shares[index], proposedValue: equalShares[index],
        }))
      }
    }
    for (const edge of input.graph.edges.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (locked.has(edge.id) || (input.controllableEdges && !input.controllableEdges.includes(edge.id))) continue
      changes.push({ scope: "EDGE", targetId: edge.id, parameter: "status", previousValue: edge.status ?? "OPEN", proposedValue: edge.status === "OPEN" ? "CLOSED" : "OPEN" })
    }
  }
  if (input.allowNodeCapacityChange) {
    for (const node of input.graph.nodes.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (locked.has(node.id) || (input.controllableNodes && !input.controllableNodes.includes(node.id)) || node.capacity === null) continue
      const minimum = input.minimumCapacity?.[node.id] ?? 0
      if (minimum >= 0 && minimum < (node.operationalCapacity ?? node.capacity)) {
        changes.push({ scope: "NODE", targetId: node.id, parameter: "capacity", previousValue: node.operationalCapacity ?? node.capacity, proposedValue: minimum })
      }
    }
  }
  if (input.allowEdgeCapacityChange) {
    for (const edge of input.graph.edges.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (locked.has(edge.id) || (input.controllableEdges && !input.controllableEdges.includes(edge.id)) || edge.capacity === null) continue
      const minimum = input.minimumCapacity?.[edge.id] ?? 0
      if (minimum >= 0 && minimum < (edge.operationalCapacity ?? edge.capacity)) {
        changes.push({ scope: "EDGE", targetId: edge.id, parameter: "capacity", previousValue: edge.operationalCapacity ?? edge.capacity, proposedValue: minimum })
      }
    }
  }
  if (input.allowThroughputChange) {
    for (const node of input.graph.nodes.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (locked.has(node.id) || (input.controllableNodes && !input.controllableNodes.includes(node.id))
        || node.throughputCapacity === null || node.throughputCapacity === undefined) continue
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
  const candidates = solver.solve(input)
  const evaluations = candidates.map((candidate) => evaluateCandidate(candidate, input, weights))
  const feasible = evaluations.filter((evaluation) => evaluation.feasible && evaluation.simulation !== null)
  const rejected = evaluations.filter((evaluation) => !evaluation.feasible || evaluation.simulation === null)
  if (feasible.length === 0) {
    const rejectionReasons = summarizeRejections(rejected)
    return {
      status: "NO_FEASIBLE_CANDIDATES", ranked: [], rejected, weights,
      solver: solver instanceof DeterministicFallbackSolver ? "DETERMINISTIC_FALLBACK" : "EXTERNAL_ADAPTER",
      reason: rejected.some((candidate) => candidate.simulation !== null) ? "NO_FEASIBLE_CANDIDATE" : "ALL_SIMULATIONS_FAILED",
      diagnostics: { rejectedCount: rejected.length, rejectionReasons },
      constraintsSummary: { rejectedCount: rejected.length, rejectionReasons },
      objectiveSummary: { weights, candidateObjectives: Object.fromEntries(rejected.map((candidate) => [candidate.candidateId, candidate.objective])) },
    }
  }
  const normalized = normalizeObjectives(feasible, weights)
  normalized.sort((a, b) => (a.objective ?? Number.POSITIVE_INFINITY) - (b.objective ?? Number.POSITIVE_INFINITY) || compareIds(a.candidateId, b.candidateId))
  normalized.forEach((evaluation, index) => { evaluation.rank = index + 1 })
  const rejectionReasons = summarizeRejections(rejected)
  return {
    status: "COMPLETED",
    ranked: normalized,
    rejected,
    weights,
    solver: solver instanceof DeterministicFallbackSolver ? "DETERMINISTIC_FALLBACK" : "EXTERNAL_ADAPTER",
    ranking: normalized.map((evaluation) => evaluation.candidateId),
    diagnostics: { rejectedCount: rejected.length, rejectionReasons },
    constraintsSummary: { rejectedCount: rejected.length, rejectionReasons },
    objectiveSummary: { weights, candidateObjectives: Object.fromEntries(normalized.map((candidate) => [candidate.candidateId, candidate.objective])) },
  }

  function summarizeRejections(rejected: CandidateEvaluation[]): Record<string, number> {
    const reasons: Record<string, number> = {}
    for (const evaluation of rejected) for (const reason of evaluation.rejectionReasons) reasons[reason] = (reasons[reason] ?? 0) + 1
    return reasons
  }
}

function evaluateCandidate(candidate: OptimizationCandidate, input: OptimizationRunInput, weights: OptimizationWeights): CandidateEvaluation {
  const rejectionReasons = validateCandidate(candidate, input)
  if (rejectionReasons.length > 0) {
    return { candidateId: candidate.id, feasible: false, rejectionReasons, objective: null, metrics: null, simulation: null }
  }
  const graph = new VenueGraph(input.graph)
  const demandChanges = candidate.changes.filter((change) => change.parameter === "demand_share")
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
    scenario: demandChanges.length === 0 ? undefined : {
      id: `${candidate.id}_SCENARIO`,
      name: candidate.id,
      baseline: "CURRENT_GRAPH",
      startTime: "1970-01-01T00:00:00Z",
      duration: input.parameters?.durationSeconds ?? 0,
      stepSeconds: input.parameters?.timestepSeconds,
      interventions: demandChanges.map((change) => ({
        parameter: "demand_share" as const,
        targetType: "NODE" as const,
        targetId: change.targetId,
        proposedValue: Number(change.proposedValue),
      })),
    },
  }
  const simulation = runSandbox(sandbox)
  const metrics = outcomeMetrics(simulation)
  return { candidateId: candidate.id, feasible: true, rejectionReasons: [], objective: objective(metrics, weights), metrics, simulation }
}

function validateCandidate(candidate: OptimizationCandidate, input: OptimizationInput): string[] {
  const reasons: string[] = []
  const locked = new Set(input.disruptionLocked ?? [])
  const operatorLocked = new Set(input.operatorLocked ?? [])
  const excluded = new Set(input.excludedEntities ?? [])
  const statusChanges = candidate.changes.filter((change) => change.parameter === "status").length
  if (input.maxStatusChanges !== undefined && statusChanges > input.maxStatusChanges) reasons.push("CHANGE_BUDGET_EXCEEDED")
  if (input.maxParameterChanges !== undefined && candidate.changes.length > input.maxParameterChanges) reasons.push("CHANGE_BUDGET_EXCEEDED")
  for (const change of candidate.changes) {
    if (locked.has(change.targetId)) reasons.push("DISRUPTION_LOCKED")
    if (operatorLocked.has(change.targetId)) reasons.push("OPERATOR_LOCKED")
    if (excluded.has(change.targetId)) reasons.push("EXCLUDED_ENTITY")
    const appliedKey = `${change.scope}:${change.targetId}:${change.parameter}`
    if (input.disruptionAppliedValues?.[appliedKey] !== undefined) {
      if (input.disruptionAppliedValues[appliedKey] !== change.proposedValue) reasons.push("DISRUPTION_APPLIED_VALUE_LOCKED")
    }
    const entity = change.scope === "NODE"
      ? input.graph.nodes.find((node) => node.id === change.targetId)
      : input.graph.edges.find((edge) => edge.id === change.targetId)
    if (!entity) {
      reasons.push("UNKNOWN_ENTITY")
      continue
    }
    if (change.parameter === "throughput_capacity" && change.scope !== "NODE") reasons.push("INVALID_PARAMETER")
    if (change.parameter === "demand_share") {
      if (change.scope !== "NODE" || !(input.graph.activeEntries ?? []).includes(change.targetId)) reasons.push("DEMAND_SHARE_INVALID")
      const share = typeof change.proposedValue === "number" ? change.proposedValue : Number.NaN
      if (!Number.isFinite(share) || share < 0 || share > 1) reasons.push("DEMAND_SHARE_INVALID")
      continue
    }
    if (change.parameter === "status" && input.maxStatusChanges === 0) reasons.push("CHANGE_BUDGET_EXCEEDED")
    if (change.parameter === "status") {
      if (change.proposedValue !== "OPEN" && change.proposedValue !== "CLOSED") reasons.push("INVALID_STATUS")
      continue
    }
    const value = typeof change.proposedValue === "number" ? change.proposedValue : Number.NaN
    if (!Number.isFinite(value) || value < 0) reasons.push("CAPACITY_OUT_OF_BOUNDS")
    if (change.scope === "NODE" && change.parameter === "capacity" && !Number.isInteger(value)) reasons.push("NON_INTEGER_CAPACITY")
    const current = change.parameter === "throughput_capacity"
      ? input.graph.nodes.find((node) => node.id === change.targetId)?.throughputCapacity
      : entity.operationalCapacity ?? entity.capacity
    if (typeof current === "number" && value > current) reasons.push("CAPACITY_OUT_OF_BOUNDS")
    const minimum = change.parameter === "throughput_capacity"
      ? input.minimumThroughput?.[change.targetId]
      : input.minimumCapacity?.[change.targetId]
    if (minimum !== undefined && value < minimum) reasons.push("CAPACITY_OUT_OF_BOUNDS")
  }
  const demandChanges = candidate.changes.filter((change) => change.parameter === "demand_share")
  if (demandChanges.length > 0) {
    const entries = (input.graph.activeEntries ?? []).slice().sort(compareIds)
    if (demandChanges.length !== entries.length || Math.abs(demandChanges.reduce((sum, change) => sum + Number(change.proposedValue), 0) - 1) > 1e-9
      || demandChanges.some((change) => !entries.includes(change.targetId))) reasons.push("DEMAND_SHARE_INVALID")
  }
  if (reasons.length > 0) return [...new Set(reasons)].sort(compareIds)
  const candidateGraph = new VenueGraph(input.graph).withOverrides(candidate.changes.map((change) => ({
    scope: change.scope,
    targetId: change.targetId,
    ...(change.parameter === "status" ? { status: change.proposedValue as "OPEN" | "CLOSED" } : {}),
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
