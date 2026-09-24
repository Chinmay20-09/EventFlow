import { capacityMetric } from "./capacity"
import { VenueGraph } from "./graph"
import { findPath } from "./pathfinding"
import type {
  CapacityMetric, CrowdGroupInput, CrowdGroupResult, RouteFlexibility, SimulationParameters,
  SimulationResult, SimulationStep, VenueEdge,
} from "./types"

interface RuntimeGroup {
  id: string
  sourceId: string
  population: number
  location: { kind: "NODE"; id: string } | { kind: "EDGE"; id: string }
  destination: string
  averageSpeed: number
  priority: number
  preferredRoute: string[]
  assignedRoute: string[]
  routeFlexibility: RouteFlexibility
  state: CrowdGroupResult["state"]
  progress: number
  remainingSeconds: number
  waitingTime: number
  travelTime: number
  movementRate: number
  queueOrder: number
  released: boolean
}

interface IntervalTransfers {
  nodeIn: Map<string, number>
  nodeOut: Map<string, number>
  edgeIn: Map<string, number>
  edgeOut: Map<string, number>
}

const DEFAULTS: Required<Pick<SimulationParameters, "durationSeconds" | "timestepSeconds" | "utilizationWarningThreshold" | "seed" | "speedSlowdownCoefficient" | "slowdownStartUtilization" | "minSpeedFactor" | "maxUpdateInterval">> = {
  durationSeconds: 600,
  timestepSeconds: 15,
  utilizationWarningThreshold: 0.85,
  seed: 0,
  speedSlowdownCoefficient: 0.8,
  slowdownStartUtilization: 0.7,
  minSpeedFactor: 0.35,
  maxUpdateInterval: 60,
}

export class DeterministicSimulator {
  private readonly graph: VenueGraph
  private readonly parameters: typeof DEFAULTS
  private readonly initial: RuntimeGroup[]
  private sequence: number

  constructor(graph: VenueGraph, groups: CrowdGroupInput[], parameters: Partial<SimulationParameters> = {}) {
    this.graph = graph
    this.parameters = { ...DEFAULTS, ...parameters }
    if (this.parameters.durationSeconds < 0 || this.parameters.timestepSeconds <= 0) {
      throw new Error("Simulation duration and timestep must be valid")
    }
    if (this.parameters.minSpeedFactor <= 0 || this.parameters.minSpeedFactor > 1) {
      throw new Error("minSpeedFactor must be in (0, 1]")
    }
    this.sequence = 0
    this.initial = groups.slice().sort((a, b) => compareIds(a.id, b.id)).map((group) => this.createInitialGroup(group))
    this.sequence = this.initial.length
  }

  run(): SimulationResult {
    this.sequence = this.initial.length
    const groups = this.initial.map((group) => ({
      ...group,
      location: { ...group.location },
      preferredRoute: [...group.preferredRoute],
      assignedRoute: [...group.assignedRoute],
    }))
    const steps: SimulationStep[] = []
    let elapsed = 0
    let previousQueues = new Map<string, number>()
    const queueGrowth: Record<string, number> = {}
    let transfersForSnapshot = emptyTransfers()
    let intervalForSnapshot = this.parameters.timestepSeconds
    while (true) {
      const step = this.snapshot(groups, elapsed, transfersForSnapshot, intervalForSnapshot)
      steps.push(step)
      for (const metric of step.nodeMetrics) {
        const previous = previousQueues.get(metric.id) ?? metric.queueSize
        queueGrowth[metric.id] = (queueGrowth[metric.id] ?? 0) + metric.queueSize - previous
      }
      previousQueues = new Map(step.nodeMetrics.map((metric) => [metric.id, metric.queueSize]))
      if (elapsed >= this.parameters.durationSeconds) break
      const delta = Math.min(this.parameters.timestepSeconds, this.parameters.durationSeconds - elapsed)
      transfersForSnapshot = this.advance(groups, delta)
      elapsed += delta
      intervalForSnapshot = delta
    }
    const final = steps[steps.length - 1]
    const bottlenecks = [...new Set([
      ...final.nodeMetrics.filter((metric) => metric.bottleneck || metric.queueSize > 0).map((metric) => `NODE:${metric.id}`),
      ...final.edgeMetrics.filter((metric) => metric.bottleneck || metric.flowUtilization !== null && metric.flowUtilization >= this.parameters.utilizationWarningThreshold)
        .map((metric) => `EDGE:${metric.id}`),
    ])].sort(compareIds)
    const capacityViolations = [...new Set([
      ...final.nodeMetrics.filter((metric) => metric.overflow > 0).map((metric) => `NODE:${metric.id}`),
      ...final.edgeMetrics.filter((metric) => metric.overflow > 0).map((metric) => `EDGE:${metric.id}`),
    ])].sort(compareIds)
    const affectedGroups = final.crowd.filter((group) => group.state !== "ARRIVED").map((group) => group.sourceId ?? group.id).sort(compareIds)
    const totalPopulation = this.initial.reduce((sum, group) => sum + group.population, 0)
    const arrivedPopulation = groups.filter((group) => group.state === "ARRIVED").reduce((sum, group) => sum + group.population, 0)
    const weightedWait = groups.reduce((sum, group) => sum + group.waitingTime * group.population, 0)
    return {
      status: "COMPLETED",
      durationSeconds: this.parameters.durationSeconds,
      steps,
      final,
      bottlenecks,
      affectedNodes: final.nodeMetrics.filter((metric) => metric.queueSize > 0 || metric.overflow > 0).map((metric) => metric.id).sort(compareIds),
      affectedEdges: final.edgeMetrics.filter((metric) => metric.currentOccupancy > 0 || metric.overflow > 0).map((metric) => metric.id).sort(compareIds),
      affectedGroups,
      queueGrowth,
      capacityViolations,
      estimatedDelaySeconds: totalPopulation === 0 ? 0 : weightedWait / totalPopulation,
      arrivedPopulation,
      strandedPopulation: Math.max(0, totalPopulation - arrivedPopulation),
      diagnostics: [],
    }
  }

  private createInitialGroup(group: CrowdGroupInput): RuntimeGroup {
    if (group.population < 0 || !Number.isFinite(group.population)) throw new Error(`Invalid population for ${group.id}`)
    if (!this.graph.node(group.destination)) throw new Error(`Unknown destination for ${group.id}`)
    if (group.currentLocation.kind === "NODE" && !this.graph.node(group.currentLocation.id)) throw new Error(`Unknown location for ${group.id}`)
    const edge = group.currentLocation.kind === "EDGE" ? this.graph.edge(group.currentLocation.id) : undefined
    if (group.currentLocation.kind === "EDGE" && !edge) throw new Error(`Unknown location for ${group.id}`)
    const progress = group.progress ?? 0
    if (progress < 0 || progress > 1) throw new Error(`Invalid progress for ${group.id}`)
    const averageSpeed = group.averageSpeed ?? 1.4
    if (averageSpeed <= 0) throw new Error(`Invalid average speed for ${group.id}`)
    const preferredRoute = [...(group.preferredRoute ?? [])]
    const assignedRoute = [...(group.assignedRoute ?? preferredRoute)]
    const routeFlexibility = group.routeFlexibility ?? "FLEXIBLE"
    const state = group.state ?? (group.currentLocation.kind === "EDGE" ? "MOVING" : "WAITING")
    const remainingSeconds = edge ? this.edgeDuration(edge, averageSpeed, 0) * (1 - progress) : 0
    const atDestination = group.currentLocation.kind === "NODE" && group.currentLocation.id === group.destination
    return {
      id: group.id,
      sourceId: group.id,
      population: group.population,
      location: { ...group.currentLocation },
      destination: group.destination,
      averageSpeed,
      priority: group.priority ?? 0,
      preferredRoute,
      assignedRoute,
      routeFlexibility,
      state: atDestination ? "ARRIVED" : state,
      progress,
      remainingSeconds,
      waitingTime: group.waitingTime ?? 0,
      travelTime: group.travelTime ?? 0,
      movementRate: 0,
      queueOrder: this.sequence++,
      released: false,
    }
  }

  private advance(groups: RuntimeGroup[], seconds: number): IntervalTransfers {
    const transfers = emptyTransfers()
    const edgeUsage = new Map<string, number>()
    const currentOccupancy = this.occupancy(groups)
    const edgeGroups = groups.filter((group) => group.location.kind === "EDGE")
      .sort((a, b) => compareIds(a.id, b.id))
    for (const group of edgeGroups) {
      const edge = group.location.kind === "EDGE" ? this.graph.edge(group.location.id) : undefined
      if (!edge) {
        group.state = "STOPPED"
        group.waitingTime += seconds
        continue
      }
      if (!this.graph.isTraversable(edge)) {
        group.state = "STOPPED"
        group.movementRate = 0
        group.waitingTime += seconds
        continue
      }
      const speed = this.effectiveSpeed(group, edge, currentOccupancy)
      const duration = this.edgeDuration(edge, group.averageSpeed, speed)
      const wasAtEnd = group.progress >= 1
      if (!wasAtEnd && group.state !== "STOPPED") {
        group.progress = clamp(group.progress + speed * seconds / edge.distance, 0, 1)
        group.travelTime += seconds
        group.movementRate = this.movementRate(group, edge, speed)
        edgeUsage.set(edge.id, (edgeUsage.get(edge.id) ?? 0) + group.movementRate)
      }
      group.remainingSeconds = duration * (1 - group.progress)
      if (group.progress < 1) {
        group.state = group.state === "DIVERTED" ? "DIVERTED" : "MOVING"
        continue
      }
      const destination = this.graph.node(edge.to)
      const occupancy = this.occupancy(groups)
      const room = destination && destination.capacity !== null
        ? Math.max(0, (destination.operationalCapacity ?? destination.capacity) - (occupancy.get(destination.id) ?? 0))
        : Number.POSITIVE_INFINITY
      const admitted = Math.min(group.population, room)
      if (!destination || destination.status === "CLOSED" || admitted <= 0) {
        group.state = "STOPPED"
        group.progress = 1
        group.movementRate = 0
        group.waitingTime += seconds
        continue
      }
      transfers.edgeOut.set(edge.id, (transfers.edgeOut.get(edge.id) ?? 0) + admitted)
      transfers.nodeIn.set(destination.id, (transfers.nodeIn.get(destination.id) ?? 0) + admitted)
      if (admitted < group.population) {
        group.population -= admitted
        const arrived = this.createNodeFragment(group, admitted, destination.id, edge.to === group.destination)
        arrived.assignedRoute = group.assignedRoute.slice(1)
        groups.push(arrived)
        group.state = "STOPPED"
        group.movementRate = 0
        group.waitingTime += seconds
      } else {
        group.location = { kind: "NODE", id: destination.id }
        group.progress = 0
        group.assignedRoute = group.assignedRoute.slice(1)
        group.state = edge.to === group.destination ? "ARRIVED" : "WAITING"
        group.movementRate = 0
        if (group.state === "ARRIVED" && destination.type === "EXIT") group.released = true
      }
    }
    const nodeOccupancy = this.occupancy(groups)
    const nodeGroups = groups.filter((group) => group.location.kind === "NODE" && group.state !== "ARRIVED")
      .sort((a, b) => b.priority - a.priority || a.queueOrder - b.queueOrder || compareIds(a.id, b.id))
    const serviceRemaining = new Map<string, number>()
    for (const node of this.graph.nodes) {
      serviceRemaining.set(node.id, node.throughputCapacity === null || node.throughputCapacity === undefined
        ? Number.POSITIVE_INFINITY : node.throughputCapacity * seconds / 60)
    }
    for (const group of nodeGroups) {
      if (group.location.kind !== "NODE") continue
      const node = this.graph.node(group.location.id)
      if (!node || node.status === "CLOSED" || this.graph.node(group.destination)?.status === "CLOSED") {
        group.state = "STOPPED"
        group.waitingTime += seconds
        continue
      }
      if (group.location.id === group.destination) {
        group.state = "ARRIVED"
        continue
      }
      const route = this.resolveRoute(group, group.location.id, edgeUsage)
      if (!route) {
        group.state = "STOPPED"
        group.waitingTime += seconds
        continue
      }
      const edge = this.graph.edge(route[0])
      const destination = edge ? this.graph.node(edge.to) : undefined
      if (!edge || !destination || !this.graph.isTraversable(edge)) {
        group.state = "STOPPED"
        group.waitingTime += seconds
        continue
      }
      const edgeCapacity = edge.operationalCapacity ?? edge.capacity
      const edgeBudget = edgeCapacity === null ? Number.POSITIVE_INFINITY
        : Math.max(0, edgeCapacity * seconds / 60 - (transfers.edgeIn.get(edge.id) ?? 0))
      const serviceBudget = serviceRemaining.get(node.id) ?? 0
      const destinationCapacity = destination.operationalCapacity ?? destination.capacity
      const room = destinationCapacity === null ? Number.POSITIVE_INFINITY
        : Math.max(0, destinationCapacity - (nodeOccupancy.get(destination.id) ?? 0))
      const granted = Math.max(0, Math.min(group.population, edgeBudget, serviceBudget, room))
      if (granted <= 0) {
        group.state = "WAITING"
        group.movementRate = 0
        group.waitingTime += seconds
        continue
      }
      transfers.nodeOut.set(node.id, (transfers.nodeOut.get(node.id) ?? 0) + granted)
      transfers.edgeIn.set(edge.id, (transfers.edgeIn.get(edge.id) ?? 0) + granted)
      serviceRemaining.set(node.id, Math.max(0, serviceBudget - granted))
      nodeOccupancy.set(node.id, Math.max(0, (nodeOccupancy.get(node.id) ?? 0) - granted))
      group.population -= granted
      const diverted = group.preferredRoute.length > 0 && !sameRoute(route, group.preferredRoute)
      const transit = this.createTransit(group, granted, edge, route, diverted)
      if (group.population > 0.000001) {
        group.state = "WAITING"
        group.waitingTime += seconds
        groups.push(transit)
      } else {
        groups.splice(groups.indexOf(group), 1, transit)
      }
    }
    return transfers
  }

  private resolveRoute(group: RuntimeGroup, nodeId: string, edgeUsage: ReadonlyMap<string, number>): string[] | null {
    if (group.assignedRoute.length > 0 && this.validRoute(group.assignedRoute, nodeId, group.destination)) {
      return group.assignedRoute
    }
    if (group.routeFlexibility !== "FLEXIBLE") return null
    const fallback = findPath(this.graph, nodeId, group.destination, edgeUsage)
    if (!fallback) return null
    group.assignedRoute = fallback.edgeIds
    return fallback.edgeIds
  }

  private validRoute(route: string[], from: string, destination: string): boolean {
    let current = from
    for (const edgeId of route) {
      const edge = this.graph.edge(edgeId)
      if (!edge || edge.from !== current || !this.graph.isTraversable(edge)) return false
      current = edge.to
    }
    return current === destination
  }

  private createTransit(group: RuntimeGroup, population: number, edge: VenueEdge, route: string[], diverted: boolean): RuntimeGroup {
    return {
      ...group,
      id: population === group.population ? group.id : `${group.sourceId}#${String(this.sequence++).padStart(4, "0")}`,
      population,
      location: { kind: "EDGE", id: edge.id },
      state: diverted ? "DIVERTED" : "MOVING",
      progress: 0,
      remainingSeconds: this.edgeDuration(edge, group.averageSpeed, this.effectiveSpeed(group, edge)),
      movementRate: 0,
      assignedRoute: [...route],
      released: false,
    }
  }

  private createNodeFragment(group: RuntimeGroup, population: number, nodeId: string, arrived: boolean): RuntimeGroup {
    return {
      ...group,
      id: `${group.sourceId}#${String(this.sequence++).padStart(4, "0")}`,
      population,
      location: { kind: "NODE", id: nodeId },
      state: arrived ? "ARRIVED" : "WAITING",
      progress: 0,
      remainingSeconds: 0,
      movementRate: 0,
      released: arrived && this.graph.node(nodeId)?.type === "EXIT",
    }
  }

  private effectiveSpeed(group: RuntimeGroup, edge: VenueEdge, occupancy = this.occupancyForInitialState()): number {
    const node = this.graph.node(edge.to)
    const capacity = node?.operationalCapacity ?? node?.capacity ?? null
    const nodeOccupancy = occupancy.get(node?.id ?? "") ?? 0
    const load = capacity === null || capacity === 0 ? 0 : nodeOccupancy / capacity
    const reduction = this.parameters.speedSlowdownCoefficient * Math.max(0, load - this.parameters.slowdownStartUtilization)
    const configuredTimeFactor = edge.currentTime === undefined || edge.currentTime <= 0 || edge.baselineTime <= 0
      ? 1
      : Math.min(1, edge.baselineTime / edge.currentTime)
    return group.averageSpeed * configuredTimeFactor * clamp(1 - reduction, this.parameters.minSpeedFactor, 1)
  }

  private occupancyForInitialState(): Map<string, number> {
    const result = new Map<string, number>()
    for (const group of this.initial) {
      if (group.location.kind === "NODE" && !group.released) {
        result.set(group.location.id, (result.get(group.location.id) ?? 0) + group.population)
      }
    }
    return result
  }

  private movementRate(group: RuntimeGroup, edge: VenueEdge, speed: number): number {
    const speedRate = 60 * group.population * speed / edge.distance
    const edgeCapacity = edge.operationalCapacity ?? edge.capacity
    const destination = this.graph.node(edge.to)
    const nodeCapacity = destination?.throughputCapacity ?? null
    return Math.min(...[speedRate, edgeCapacity, nodeCapacity].filter((value): value is number => value !== null))
  }

  private edgeDuration(edge: VenueEdge, averageSpeed: number, speed = averageSpeed): number {
    return Math.max(0.001, edge.distance / Math.max(0.001, speed))
  }

  private occupancy(groups: RuntimeGroup[]): Map<string, number> {
    const result = new Map<string, number>()
    for (const group of groups) {
      if (group.location.kind === "NODE" && !group.released) {
        result.set(group.location.id, (result.get(group.location.id) ?? 0) + group.population)
      }
    }
    return result
  }

  private snapshot(groups: RuntimeGroup[], timeSeconds: number, transfers: IntervalTransfers, intervalSeconds: number): SimulationStep {
    const occupancy = this.occupancy(groups)
    const nodeMetrics: CapacityMetric[] = this.graph.nodes.map((node) => {
      const atNode = groups.filter((group) => group.location.kind === "NODE" && group.location.id === node.id && !group.released)
      const queue = atNode.filter((group) => group.state === "WAITING").reduce((sum, group) => sum + group.population, 0)
      return capacityMetric(
        node,
        occupancy.get(node.id) ?? 0,
        rate(transfers.nodeIn.get(node.id) ?? 0, intervalSeconds),
        rate(transfers.nodeOut.get(node.id) ?? 0, intervalSeconds),
        queue,
        0,
        intervalSeconds,
      )
    })
    const edgeMetrics = this.graph.edges.map((edge) => {
      const atEdge = groups.filter((group) => group.location.kind === "EDGE" && group.location.id === edge.id)
      const edgeOccupancy = atEdge.reduce((sum, group) => sum + group.population, 0)
      const flow = atEdge.reduce((sum, group) => sum + (group.state === "MOVING" || group.state === "DIVERTED"
        ? this.movementRate(group, edge, this.effectiveSpeed(group, edge, occupancy)) : 0), 0)
      return {
        ...capacityMetric(
          edge,
          edgeOccupancy,
          rate(transfers.edgeIn.get(edge.id) ?? 0, intervalSeconds),
          rate(transfers.edgeOut.get(edge.id) ?? 0, intervalSeconds),
          0,
          flow,
          intervalSeconds,
        ),
        id: edge.id,
      }
    })
    const crowd = groups.slice().sort((a, b) => compareIds(a.id, b.id)).map((group): CrowdGroupResult => ({
      id: group.id,
      sourceId: group.sourceId,
      population: group.population,
      currentLocation: group.location,
      destination: group.destination,
      averageSpeed: group.averageSpeed,
      priority: group.priority,
      preferredRoute: group.preferredRoute,
      assignedRoute: group.assignedRoute,
      routeFlexibility: group.routeFlexibility,
      state: group.state,
      progress: group.progress,
      waitingTime: group.waitingTime,
      travelTime: group.travelTime,
      movementRate: group.movementRate,
      route: group.assignedRoute,
    }))
    return { timeSeconds, nodeMetrics, edgeMetrics, crowd }
  }
}

function emptyTransfers(): IntervalTransfers {
  return { nodeIn: new Map(), nodeOut: new Map(), edgeIn: new Map(), edgeOut: new Map() }
}

function rate(value: number, seconds: number): number {
  return value * 60 / Math.max(seconds, 0.001)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function sameRoute(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((edge, index) => edge === second[index])
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
