export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH"

export type Alert = {
  type: string
  title: string
  location: string
  severity: AlertSeverity
  time: string
  description: string
  action: string
}

const STRATEGY_A_ALERTS: Alert[] = [
  {
    type: "Crowd Flow",
    title: "Crowd successfully redirected",
    location: "North Gate",
    severity: "LOW",
    time: "Today • 6:45 PM",
    description: "Pedestrian congestion has reduced after rerouting.",
    action: "Continue monitoring for the next 15 minutes.",
  },
  {
    type: "Transit",
    title: "Transit operating efficiently",
    location: "Central Station",
    severity: "LOW",
    time: "Today • 6:47 PM",
    description: "Public transport capacity is stable.",
    action: "No immediate intervention required.",
  },
]

const STRATEGY_B_ALERTS: Alert[] = [
  {
    type: "Entry Control",
    title: "Additional gate opened",
    location: "North Gate",
    severity: "MEDIUM",
    time: "Today • 6:45 PM",
    description: "A new entry gate has increased visitor throughput.",
    action: "Deploy 2 staff members to supervise entry.",
  },
  {
    type: "Crowd Flow",
    title: "Entry flow stabilizing",
    location: "Central Station",
    severity: "LOW",
    time: "Today • 6:47 PM",
    description: "Visitor movement is becoming evenly distributed.",
    action: "Continue live monitoring.",
  },
]

const LIVE_ALERTS: Alert[] = [
  {
    type: "Crowd Density",
    title: "Crowd buildup detected",
    location: "North Gate",
    severity: "HIGH",
    time: "Today • 6:42 PM",
    description: "Crowd utilization has exceeded 90% capacity.",
    action: "Redirect visitors or open an additional gate.",
  },
  {
    type: "Transit Capacity",
    title: "Transit capacity decreasing",
    location: "Central Station",
    severity: "MEDIUM",
    time: "Today • 6:39 PM",
    description: "Passenger movement has slowed significantly.",
    action: "Increase transport frequency if available.",
  },
  {
    type: "Weather",
    title: "Weather disruption possible",
    location: "East Zone",
    severity: "MEDIUM",
    time: "Today • 6:36 PM",
    description: "Light rainfall may affect outdoor movement.",
    action: "Prepare sheltered routing for attendees.",
  },
]

/** The alerts shown for the currently simulated strategy (or the live feed). */
export function alertsForStrategy(selectedStrategy: string | null): Alert[] {
  if (selectedStrategy === "A") return STRATEGY_A_ALERTS
  if (selectedStrategy === "B") return STRATEGY_B_ALERTS
  return LIVE_ALERTS
}
