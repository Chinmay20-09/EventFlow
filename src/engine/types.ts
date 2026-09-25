export type NodeStatus = "OPEN" | "CLOSED"
export type CrowdLocation = { kind: "NODE"; id: string } | { kind: "EDGE"; id: string }
export type CrowdState = "MOVING" | "WAITING" | "STOPPED" | "ARRIVED" | "DIVERTED"
export type RouteFlexibility = "NONE" | "LIMITED" | "FLEXIBLE"
export type NodeType =
  | "ZONE"
  | "GATE"
  | "ENTRANCE"
  | "EXIT"
  | "TRANSIT"
  | "CHECKPOINT"
  | "ROAD"
  | string

export interface VenueNode {
  id: string
  label: string
  type: NodeType
  latitude?: number
  longitude?: number
  capacity: number | null
  operationalCapacity?: number | null
  throughputCapacity?: number | null
  status?: NodeStatus
  restriction?: string
  restrictions?: string[]
}

export interface VenueEdge {
  id: string
  label?: string
  from: string
  to: string
  distance: number
  baselineTime: number
  currentTime?: number
  capacity: number | null
  operationalCapacity?: number | null
  status?: NodeStatus
  restriction?: string
  restrictions?: string[]
}

export interface VenueGraphInput {
  nodes: VenueNode[]
  edges: VenueEdge[]
  activeEntries?: string[]
  activeExits?: string[]
}

export interface CrowdGroupInput {
  id: string
  population: number
  currentLocation: CrowdLocation
  destination: string
  averageSpeed?: number
  movementRate?: number
  priority?: number
  preferredRoute?: string[]
  assignedRoute?: string[]
  routeFlexibility?: RouteFlexibility
  state?: CrowdState
  progress?: number
  waitingTime?: number
  travelTime?: number
}

export interface CrowdGroupResult extends CrowdGroupInput {
  currentLocation: CrowdLocation
  state: CrowdState
  progress: number
  waitingTime: number
  travelTime: number
  movementRate?: number
  sourceId?: string
  route: string[]
}

export type DisruptionType =
  | "BLOCKED_CORRIDOR"
  | "CLOSED_GATE"
  | "REDUCED_CAPACITY"
  | "INCREASED_TRAVEL_TIME"
  | "RESTRICTED_ZONE"
  | "EMERGENCY_EXIT_UNAVAILABLE"
  | string

export type OperationalEffectParameter = "status" | "capacity" | "throughput_capacity" | "restriction"
export type OperationalEffectStatus = "PROPOSED" | "APPLIED" | "REJECTED" | "SUPERSEDED"

export interface OperationalEffect {
  targetType: "NODE" | "EDGE" | "EVENT"
  targetId: string | null
  parameter: OperationalEffectParameter
  previousValue: string | number | null
  proposedValue: string | number
  appliedValue?: string | number | null
  appliedAt?: string | null
  effectStatus: OperationalEffectStatus
}

export interface Disruption {
  id: string
  type: DisruptionType
  affectedNodes?: string[]
  affectedEdges?: string[]
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  status?: "DETECTED" | "ACTIVE" | "RESOLVED"
  capacity?: number
  travelTimeMultiplier?: number
  travelTime?: number
  restriction?: string
  startTime?: string
  expectedDuration?: number
  detectedAt?: string
  effectStartedAt?: string
  resolvedAt?: string
  source?: "LIVE" | "SIMULATION"
  operationalEffects?: OperationalEffect[]
}

export interface SimulationParameters {
  durationSeconds: number
  timestepSeconds: number
  utilizationWarningThreshold?: number
  seed?: number
  speedSlowdownCoefficient?: number
  slowdownStartUtilization?: number
  minSpeedFactor?: number
  maxUpdateInterval?: number
  simulatedStartTime?: string
  densityMediumThreshold?: number
  densityHighThreshold?: number
  densityCriticalThreshold?: number
  queueWarningIntervals?: number
}

export interface CapacityMetric {
  id: string
  physicalCapacity: number | null
  operationalCapacity: number | null
  currentOccupancy: number
  inflow: number
  outflow: number
  utilization: number | null
  queueSize: number
  overflow: number
  bottleneck: boolean
  flow: number
  holdingUtilization: number | null
  serviceUtilization: number | null
  flowUtilization: number | null
  overloaded: boolean | null
  density: number | null
  densityState: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN"
}

export interface EdgeMetric extends CapacityMetric {
  id: string
}

export interface SimulationStep {
  timeSeconds: number
  nodeMetrics: CapacityMetric[]
  edgeMetrics: EdgeMetric[]
  crowd: CrowdGroupResult[]
  transfers: TransferLedger
}

export interface TransferLedger {
  nodeIn: Record<string, number>
  nodeOut: Record<string, number>
  edgeIn: Record<string, number>
  edgeOut: Record<string, number>
}

export type SimulationStatus = "COMPLETED" | "TERMINATED" | "INVALID_INPUT" | "INVALID_SCENARIO" | "INVALID_OVERRIDE" | "SIMULATION_FAILURE" | "TIMEOUT"
export type MetricName = "population" | "occupancy" | "flow" | "density" | "queue_size" | "waiting_time" | "travel_time" | "arrived_population" | "diverted_population" | "congestion" | "capacity_utilization" | "throughput" | "intervention_impact" | "time_to_congestion" | "peak_congestion" | "peak_queue" | "recovery_time" | "duration"
export interface ScopedMetric {
  metric: MetricName
  targetType: "NODE" | "EDGE" | "GROUP" | "EVENT"
  targetId: string | null
  aggregation: "PEAK" | "FINAL" | "MEAN" | "SUM" | "FIRST" | "DELTA"
  value: number | null
  unit: "people" | "people/minute" | "metres" | "metres/second" | "seconds" | "dimensionless"
}
export interface SimulationEvent {
  simTime: string
  type: string
  targetType: "NODE" | "EDGE" | "GROUP" | "EVENT" | null
  targetId: string | null
  detail: Record<string, unknown>
}
export interface SimulationWarning {
  code: string
  message: string
}
export interface SimulationMetrics {
  population: number
  occupancy: number
  flow: number
  density: number
  queueSize: number
  waitingTime: number
  travelTime: number
  arrivedPopulation: number
  divertedPopulation: number
  congestion: number
  capacityUtilization: number
  throughput: number
  interventionImpact: number | null
  timeToCongestion: number | null
  peakCongestion: number
  peakQueue: number
  recoveryTime: number | null
  duration: number
}
export interface SimulationFinalState {
  population: number
  overloadedNodes: string[]
  overloadedEdges: string[]
  activeScenarioDisruptions: string[]
  affectedEntityStatus: Record<string, NodeStatus>
}

export interface SimulationResult {
  id: string
  scenarioId: string
  strategyId: string | null
  status: SimulationStatus
  baseline: Baseline
  baselineRef: string | null
  seed: number
  simulatedStartTime: string
  simulatedEndTime: string
  metrics: SimulationMetrics
  scopedMetrics: ScopedMetric[]
  finalState: SimulationFinalState
  events: SimulationEvent[]
  warnings: SimulationWarning[]
  durationSeconds: number
  steps: SimulationStep[]
  final: SimulationStep
  bottlenecks: string[]
  affectedNodes: string[]
  affectedEdges: string[]
  affectedGroups: string[]
  queueGrowth: Record<string, number>
  capacityViolations: string[]
  estimatedDelaySeconds: number
  arrivedPopulation: number
  strandedPopulation: number
  diagnostics: string[]
  timeline?: SimulationStep[]
}

export interface GraphOverride {
  scope: "NODE" | "EDGE"
  targetId: string
  status?: NodeStatus
  capacity?: number | null
  throughputCapacity?: number | null
  currentTime?: number
  restriction?: string
}

export interface SandboxInput {
  graph: VenueGraphInput
  crowd: CrowdGroupInput[]
  adjustments?: PopulationAdjustment[]
  disruptions?: Disruption[]
  graphOverrides?: GraphOverride[]
  parameters?: Partial<SimulationParameters>
  scenario?: ScenarioInput
}

export type PopulationAdjustmentReason =
  | "SOURCE_DEMAND"
  | "ENTRANCE_DEMAND"
  | "SINK_RELEASE"
  | "SENSOR_CORRECTION"
  | "MANUAL_ADJUSTMENT"
  | "SCENARIO_INJECTION"

export interface PopulationAdjustment {
  id: string
  reason: PopulationAdjustmentReason
  scope: "NODE" | "GROUP" | "EVENT"
  targetId: string | null
  amount: number
  timestamp?: string
  destination?: string
  averageSpeed?: number
}

export type Baseline = "INITIAL_GRAPH" | "CURRENT_GRAPH" | "CAPTURED_STATE"

export interface Intervention {
  parameter: "status" | "capacity" | "throughput_capacity" | "demand_share"
  targetType: "NODE" | "EDGE"
  targetId: string
  previousValue?: string | number | null
  proposedValue: string | number
}

export interface CrowdOverride {
  groupId?: string
  population?: number
  currentLocation?: CrowdLocation
  destination?: string
  assignedRoute?: string[]
  routeFlexibility?: RouteFlexibility
  averageSpeed?: number
  progress?: number
}

export interface ScenarioInput {
  id: string
  name: string
  baseline: Baseline
  baselineRef?: string | null
  graphOverrides?: GraphOverride[]
  crowdOverrides?: CrowdOverride[]
  disruptionOverrides?: Disruption[]
  operationalParameters?: OperationalParameterOverride[]
  interventions?: Intervention[]
  startTime: string
  duration: number
  stepSeconds?: number
  strategyId?: string | null
}

export interface OperationalParameterOverride {
  key: OperationalEffectParameter
  scope: "NODE" | "EDGE" | "EVENT"
  targetId: string | null
  value: string | number
  unit?: "people" | "people/minute" | "seconds" | "dimensionless"
}

export interface ScenarioComparison {
  baselineScenarioId: string
  results: SimulationResult[]
  impact: Array<{
    scenarioId: string
    arrivedPopulationDelta: number
    estimatedDelaySecondsDelta: number
  }>
  valid?: boolean
  warnings?: string[]
  metricMatrix?: Record<string, Record<string, number | null>>
}

export interface OptimizationChange {
  scope: "NODE" | "EDGE"
  targetId: string
  parameter: "status" | "capacity" | "throughput_capacity" | "demand_share"
  previousValue: string | number | null
  proposedValue: string | number | null
}

export interface OptimizationInput {
  graph: VenueGraphInput
  maxCandidates?: number
  allowStatusChange?: boolean
  allowDemandRebalancing?: boolean
  demandShares?: Record<string, number>
  allowNodeCapacityChange?: boolean
  allowEdgeCapacityChange?: boolean
  allowThroughputChange?: boolean
  minimumCapacity?: Record<string, number>
  minimumThroughput?: Record<string, number>
  disruptionLocked?: string[]
  operatorLocked?: string[]
  excludedEntities?: string[]
  maxStatusChanges?: number
  maxParameterChanges?: number
  controllableNodes?: string[]
  controllableEdges?: string[]
  disruptionAppliedValues?: Record<string, string | number>
}

export interface OptimizationCandidate {
  id: string
  changes: OptimizationChange[]
  feasible: boolean
  rejectionReasons: string[]
}

export interface OptimizationWeights {
  congestion: number
  queueSize: number
  waitingTime: number
  travelTime: number
  throughput: number
}

export interface CandidateEvaluation {
  candidateId: string
  feasible: boolean
  rejectionReasons: string[]
  objective: number | null
  metrics: {
    peakCongestion: number
    peakQueue: number
    waitingTime: number
    travelTime: number
    throughput: number
  } | null
  simulation: SimulationResult | null
  rank?: number
}

export interface OptimizationResult {
  status: "COMPLETED" | "NO_FEASIBLE_CANDIDATES"
  ranked: CandidateEvaluation[]
  rejected: CandidateEvaluation[]
  weights: OptimizationWeights
  solver: "DETERMINISTIC_FALLBACK" | "EXTERNAL_ADAPTER"
  ranking?: string[]
  diagnostics?: { rejectedCount: number; rejectionReasons: Record<string, number> }
  reason?: "NO_FEASIBLE_CANDIDATE" | "ALL_SIMULATIONS_FAILED" | null
  objectiveSummary?: { weights: OptimizationWeights; candidateObjectives: Record<string, number | null> }
  constraintsSummary?: { rejectedCount: number; rejectionReasons: Record<string, number> }
}

export interface StrategySolver {
  solve(input: OptimizationInput): OptimizationCandidate[]
}
