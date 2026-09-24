import type { CapacityMetric, VenueEdge, VenueNode } from "./types"

/** Utilization for a positive capacity. Zero capacity is not a ratio. */
export function utilization(value: number, capacity: number | null): number | null {
  if (capacity === null || capacity === 0) return null
  return value / capacity
}

export function overload(value: number, capacity: number | null): boolean | null {
  if (capacity === null) return null
  return capacity === 0 ? value > 0 : value > capacity
}

export function capacityMetric(
  item: VenueNode | VenueEdge,
  occupancy: number,
  inflow: number,
  outflow: number,
  queueSize = 0,
  flow = 0,
  intervalSeconds = 60,
  densityThresholds = { medium: 0.5, high: 0.8, critical: 1 },
): CapacityMetric {
  const operationalCapacity = item.operationalCapacity ?? item.capacity
  const isNode = "throughputCapacity" in item
  const holdingUtilization = isNode ? utilization(occupancy, operationalCapacity) : null
  const serviceUtilization = isNode
    ? utilization(inflow * 60 / Math.max(intervalSeconds, 0.001), item.throughputCapacity ?? null)
    : null
  const flowUtilization = isNode ? null : utilization(flow, operationalCapacity)
  const measured = isNode ? occupancy : flow
  const measuredOverload = overload(measured, operationalCapacity)
  const overflow = operationalCapacity === null
    ? 0
    : Math.max(0, measured - operationalCapacity)
  return {
    id: item.id,
    physicalCapacity: item.capacity,
    operationalCapacity,
    currentOccupancy: occupancy,
    inflow,
    outflow,
    utilization: isNode ? holdingUtilization : flowUtilization,
    queueSize,
    overflow,
    bottleneck: measuredOverload === true
      || queueSize > 0
      || (isNode && (serviceUtilization ?? 0) >= 1)
      || (!isNode && (flowUtilization ?? 0) >= 1),
    flow,
    holdingUtilization,
    serviceUtilization,
    flowUtilization,
    overloaded: measuredOverload,
    density: isNode ? holdingUtilization : flowUtilization,
    densityState: densityState(isNode ? holdingUtilization : flowUtilization, densityThresholds),
  }
}

function densityState(
  density: number | null,
  thresholds: { medium: number; high: number; critical: number },
): CapacityMetric["densityState"] {
  if (density === null) return "UNKNOWN"
  if (density >= thresholds.critical) return "CRITICAL"
  if (density >= thresholds.high) return "HIGH"
  if (density >= thresholds.medium) return "MEDIUM"
  return "LOW"
}

export function flowUtilization(flow: number, capacity: number | null): number | null {
  return utilization(flow, capacity)
}
