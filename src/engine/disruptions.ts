import { VenueGraph } from "./graph"
import type { Disruption, VenueGraphInput } from "./types"

export function applyDisruptions(graph: VenueGraphInput, disruptions: Disruption[]): VenueGraph {
  return new VenueGraph(graph).withOverrides([], disruptions)
}
