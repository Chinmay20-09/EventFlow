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
  source?: "LIVE" | "SIMULATION"
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
}

export interface EdgeMetric extends CapacityMetric {
  id: string
}

export interface SimulationStep {
  timeSeconds: number
  nodeMetrics: CapacityMetric[]
  edgeMetrics: EdgeMetric[]
  crowd: CrowdGroupResult[]
}

export interface SimulationResult {
  status: "COMPLETED" | "TERMINATED" | "INVALID_INPUT" | "INVALID_SCENARIO" | "INVALID_OVERRIDE" | "SIMULATION_FAILURE"
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
  scenarioId?: string
  baseline?: Baseline
  baselineRef?: string | null
  seed?: number
  warnings?: string[]
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
  disruptions?: Disruption[]
  graphOverrides?: GraphOverride[]
  parameters?: Partial<SimulationParameters>
  scenario?: ScenarioInput
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
  interventions?: Intervention[]
  startTime: string
  duration: number
  stepSeconds?: number
}

export interface OptimizationChange {
  scope: "NODE" | "EDGE"
  targetId: string
  parameter: "status" | "capacity" | "throughput_capacity"
  previousValue: string | number | null
  proposedValue: string | number | null
}

export interface OptimizationInput {
  graph: VenueGraphInput
  maxCandidates?: number
  allowNodeCapacityChange?: boolean
  allowEdgeCapacityChange?: boolean
  allowThroughputChange?: boolean
  minimumCapacity?: Record<string, number>
  minimumThroughput?: Record<string, number>
  disruptionLocked?: string[]
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
}

export interface OptimizationResult {
  status: "COMPLETED" | "NO_FEASIBLE_CANDIDATES"
  ranked: CandidateEvaluation[]
  rejected: CandidateEvaluation[]
  weights: OptimizationWeights
  solver: "DETERMINISTIC_FALLBACK" | "EXTERNAL_ADAPTER"
}

export interface StrategySolver {
  generate(input: OptimizationInput): OptimizationCandidate[]
}
