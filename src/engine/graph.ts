import type { Disruption, GraphOverride, VenueEdge, VenueGraphInput, VenueNode } from "./types"

const status = <T extends { status?: "OPEN" | "CLOSED" }>(item: T): "OPEN" | "CLOSED" =>
  item.status ?? "OPEN"

export class VenueGraph {
  readonly nodes: readonly VenueNode[]
  readonly edges: readonly VenueEdge[]
  readonly activeEntries: readonly string[]
  readonly activeExits: readonly string[]
  private readonly nodeById: ReadonlyMap<string, VenueNode>
  private readonly edgeById: ReadonlyMap<string, VenueEdge>

  constructor(input: VenueGraphInput) {
    const nodes = [...input.nodes]
      .map((node) => ({ ...node, status: status(node) }))
      .sort((a, b) => compareIds(a.id, b.id))
    const edges = [...input.edges]
      .map((edge) => ({ ...edge, label: edge.label ?? `${input.nodes.find((node) => node.id === edge.from)?.label ?? edge.from} -> ${input.nodes.find((node) => node.id === edge.to)?.label ?? edge.to}`, status: status(edge), currentTime: edge.currentTime ?? edge.baselineTime }))
      .sort((a, b) => compareIds(a.id, b.id))
    const nodeIds = new Set<string>()
    for (const node of nodes) {
      if (!node.id || nodeIds.has(node.id)) throw new Error(`Duplicate or empty node id: ${node.id}`)
      if (node.capacity !== null && (!Number.isInteger(node.capacity) || node.capacity < 0)) {
        throw new Error(`Invalid capacity for node ${node.id}`)
      }
      if (node.operationalCapacity !== undefined && node.operationalCapacity !== null
        && (!Number.isInteger(node.operationalCapacity) || node.operationalCapacity < 0)) {
        throw new Error(`Invalid operational capacity for node ${node.id}`)
      }
      if (node.capacity !== null && node.operationalCapacity !== undefined && node.operationalCapacity !== null
        && node.operationalCapacity > node.capacity) {
        throw new Error(`Operational capacity exceeds physical capacity for node ${node.id}`)
      }
      if (node.throughputCapacity !== undefined && node.throughputCapacity !== null
        && (!Number.isFinite(node.throughputCapacity) || node.throughputCapacity < 0)) {
        throw new Error(`Invalid throughput capacity for node ${node.id}`)
      }
      nodeIds.add(node.id)
    }
    const edgeIds = new Set<string>()
    const physicalEdges = new Map<string, string | undefined>()
    for (const edge of edges) {
      if (!edge.id || edgeIds.has(edge.id)) throw new Error(`Duplicate or empty edge id: ${edge.id}`)
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`Edge ${edge.id} has an unknown endpoint`)
      if (!Number.isFinite(edge.distance) || !Number.isFinite(edge.baselineTime) || !Number.isFinite(edge.currentTime)
        || edge.distance <= 0 || edge.baselineTime <= 0 || (edge.currentTime ?? 0) <= 0) {
        throw new Error(`Invalid traversal values for edge ${edge.id}`)
      }
      if (edge.capacity !== null && edge.capacity < 0) throw new Error(`Invalid capacity for edge ${edge.id}`)
      if (edge.operationalCapacity !== undefined && edge.operationalCapacity !== null
        && (!Number.isFinite(edge.operationalCapacity) || edge.operationalCapacity < 0)) {
        throw new Error(`Invalid operational capacity for edge ${edge.id}`)
      }
      if (edge.capacity !== null && edge.operationalCapacity !== undefined && edge.operationalCapacity !== null
        && edge.operationalCapacity > edge.capacity) {
        throw new Error(`Operational capacity exceeds physical capacity for edge ${edge.id}`)
      }
      const physicalKey = `${edge.from}\u0000${edge.to}\u0000${edge.distance}`
      const existingLabel = physicalEdges.get(physicalKey)
      if (existingLabel !== undefined && existingLabel === edge.label) {
        throw new Error(`Duplicate physical edge representation: ${edge.id}`)
      }
      physicalEdges.set(physicalKey, edge.label)
      edgeIds.add(edge.id)
    }
    this.nodes = nodes
    this.edges = edges
    this.nodeById = new Map(nodes.map((node) => [node.id, node]))
    this.edgeById = new Map(edges.map((edge) => [edge.id, edge]))
    this.activeEntries = [...(input.activeEntries ?? [])].sort()
    this.activeExits = [...(input.activeExits ?? [])].sort()
    for (const id of this.activeEntries) {
      if (!nodeIds.has(id)) throw new Error(`Unknown active access node: ${id}`)
      if (!["ENTRANCE", "GATE"].includes(this.nodeById.get(id)?.type ?? "")) throw new Error(`Invalid active entry node: ${id}`)
    }
    for (const id of this.activeExits) {
      if (!nodeIds.has(id)) throw new Error(`Unknown active access node: ${id}`)
      if (!["EXIT", "GATE"].includes(this.nodeById.get(id)?.type ?? "")) throw new Error(`Invalid active exit node: ${id}`)
    }
  }

  node(id: string): VenueNode | undefined { return this.nodeById.get(id) }
  edge(id: string): VenueEdge | undefined { return this.edgeById.get(id) }
  outgoing(nodeId: string): VenueEdge[] {
    return this.edges.filter((edge) => edge.from === nodeId).sort((a, b) => compareIds(a.id, b.id))
  }
  isTraversable(edge: VenueEdge): boolean {
    return edge.status === "OPEN" && this.node(edge.from)?.status === "OPEN" && this.node(edge.to)?.status === "OPEN"
  }
  clone(): VenueGraph {
    return new VenueGraph({
      nodes: this.nodes.map((node) => ({ ...node })),
      edges: this.edges.map((edge) => ({ ...edge })),
      activeEntries: [...this.activeEntries],
      activeExits: [...this.activeExits],
    })
  }
  toJSON(): VenueGraphInput {
    return {
      nodes: this.nodes.map((node) => ({ ...node })),
      edges: this.edges.map((edge) => ({ ...edge })),
      activeEntries: [...this.activeEntries],
      activeExits: [...this.activeExits],
    }
  }
  withOverrides(overrides: GraphOverride[] = [], disruptions: Disruption[] = []): VenueGraph {
    const nodes = this.nodes.map((node) => ({ ...node }))
    const edges = this.edges.map((edge) => ({ ...edge }))
    const nodeMap = new Map(nodes.map((node) => [node.id, node]))
    const edgeMap = new Map(edges.map((edge) => [edge.id, edge]))
    const apply = (override: GraphOverride) => {
      const item = override.scope === "NODE" ? nodeMap.get(override.targetId) : edgeMap.get(override.targetId)
      if (!item) throw new Error(`Unknown graph override target: ${override.targetId}`)
      if (override.status !== undefined) item.status = override.status
      if (override.capacity !== undefined) item.operationalCapacity = override.capacity
      if (override.throughputCapacity !== undefined && "throughputCapacity" in item) item.throughputCapacity = override.throughputCapacity
      if (override.currentTime !== undefined && "currentTime" in item) item.currentTime = override.currentTime
      if (override.restriction !== undefined) {
        const restriction = override.restriction
        item.restrictions = [...new Set([...(item.restrictions ?? []), restriction])]
      }
    }
    overrides.slice().sort((a, b) => compareIds(`${a.scope}:${a.targetId}`, `${b.scope}:${b.targetId}`)).forEach(apply)
    disruptions
      .filter((disruption) => disruption.status === "ACTIVE")
      .slice().sort((a, b) => compareIds(a.id, b.id))
      .forEach((disruption) => {
        const nodeIds = disruption.affectedNodes ?? []
        const edgeIds = disruption.affectedEdges ?? []
        for (const id of nodeIds) if (!nodeMap.has(id)) throw new Error(`Unknown disruption node target: ${id}`)
        for (const id of edgeIds) if (!edgeMap.has(id)) throw new Error(`Unknown disruption edge target: ${id}`)
        if (["CLOSED_GATE", "EMERGENCY_EXIT_UNAVAILABLE"].includes(disruption.type)) {
          nodeIds.forEach((id) => {
            const node = nodeMap.get(id)
            if (node) node.status = "CLOSED"
          })
        }
        if (["BLOCKED_CORRIDOR", "CLOSED_GATE"].includes(disruption.type)) {
          edgeIds.forEach((id) => { const edge = edgeMap.get(id); if (edge) edge.status = "CLOSED" })
        }
        if (disruption.type === "REDUCED_CAPACITY" && disruption.capacity !== undefined) {
          edgeIds.forEach((id) => {
            const edge = edgeMap.get(id)
            if (edge) edge.operationalCapacity = Math.min(edge.operationalCapacity ?? edge.capacity ?? disruption.capacity!, disruption.capacity!)
          })
          nodeIds.forEach((id) => {
            const node = nodeMap.get(id)
            if (node) node.operationalCapacity = Math.min(node.operationalCapacity ?? node.capacity ?? disruption.capacity!, disruption.capacity!)
          })
        }
        if (disruption.type === "RESTRICTED_ZONE" && disruption.restriction) {
          nodeIds.forEach((id) => {
            const node = nodeMap.get(id)
            if (node && disruption.restriction) node.restrictions = [...new Set([...(node.restrictions ?? []), disruption.restriction])]
          })
          edgeIds.forEach((id) => {
            const edge = edgeMap.get(id)
            if (edge && disruption.restriction) edge.restrictions = [...new Set([...(edge.restrictions ?? []), disruption.restriction])]
          })
        }
        if (disruption.type === "INCREASED_TRAVEL_TIME") {
          edgeIds.forEach((id) => {
            const edge = edgeMap.get(id)
            if (edge) edge.currentTime = disruption.travelTime ?? edge.currentTime! * (disruption.travelTimeMultiplier ?? 1)
          })
        }
      })
    for (const id of [...nodeMap.keys(), ...edgeMap.keys()]) {
      if (!id) throw new Error("Invalid graph override target")
    }
    return new VenueGraph({ nodes, edges, activeEntries: [...this.activeEntries], activeExits: [...this.activeExits] })
  }
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
