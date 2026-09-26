import { VenueGraph } from "./graph"

export interface PathResult { edgeIds: string[]; cost: number }

export function findPath(
  graph: VenueGraph,
  from: string,
  destination: string,
  edgeUsage: ReadonlyMap<string, number> = new Map(),
): PathResult | null {
  if (from === destination) return { edgeIds: [], cost: 0 }
  const best = new Map<string, { cost: number; distance: number; path: string[] }>()
  const pending: { node: string; cost: number; path: string[] }[] = [{ node: from, cost: 0, path: [] }]
  best.set(from, { cost: 0, distance: 0, path: [] })
  while (pending.length > 0) {
    pending.sort((a, b) => a.cost - b.cost || comparePath(a.path, b.path) || compareIds(a.node, b.node))
    const current = pending.shift()!
    if (current.node === destination) return { edgeIds: current.path, cost: current.cost }
    for (const edge of graph.outgoing(current.node)) {
      if (!graph.isTraversable(edge)) continue
      const capacity = edge.operationalCapacity ?? edge.capacity
      const usage = edgeUsage.get(edge.id) ?? 0
      if (capacity !== null && (capacity <= 0 || usage >= capacity)) continue
      const congestion = capacity && capacity > 0 ? 1 + Math.max(0, usage) / capacity : 1
      const cost = current.cost + (edge.currentTime ?? edge.baselineTime) * congestion
      const path = [...current.path, edge.id]
      const distance = currentDistance(current.path, graph) + edge.distance
      const previous = best.get(edge.to)
      if (!previous || isBetter(cost, distance, path, previous)) {
        best.set(edge.to, { cost, distance, path })
        pending.push({ node: edge.to, cost, path })
      }
    }

    function compareIds(a: string, b: string): number {
      return a < b ? -1 : a > b ? 1 : 0
    }

    function comparePath(a: string[], b: string[]): number {
      const length = Math.min(a.length, b.length)
      for (let index = 0; index < length; index += 1) {
        const comparison = compareIds(a[index], b[index])
        if (comparison !== 0) return comparison
      }
      return a.length - b.length
    }

    function isBetter(cost: number, distance: number, path: string[], previous: { cost: number; distance: number; path: string[] }): boolean {
      return cost < previous.cost
        || (cost === previous.cost && (distance < previous.distance || (distance === previous.distance && comparePath(path, previous.path) < 0)))
    }

    function currentDistance(path: string[], graph: VenueGraph): number {
      return path.reduce((total, edgeId) => total + (graph.edge(edgeId)?.distance ?? 0), 0)
    }
  }
  return null
}
