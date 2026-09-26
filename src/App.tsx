import { useEffect, useState } from "react"
import {
  eventApi,
  setApiUserId,
  type AlertRecord,
  type ApiHealth,
  type DashboardData,
  type EventRecord,
  type EventSettings,
  type ForecastZone,
  type Recommendation,
  type SimulationResult,
  type StrategySet,
  type TimelineRecord,
} from "./api"

function App() {
  const [isDark, setIsDark] = useState(true)
  const [activePage, setActivePage] = useState("Overview")
  const [sandboxOpen, setSandboxOpen] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [strategyApproved, setStrategyApproved] = useState(false)
  const [executionStatus, setExecutionStatus] = useState("Ready")
  const [eventName, setEventName] = useState("Mumbai Music Festival")
  const [maxCapacity, setMaxCapacity] = useState(50000)
  const [alertThreshold, setAlertThreshold] = useState(85)
  const [autoAlerts, setAutoAlerts] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [backendUserId, setBackendUserId] = useState(import.meta.env.VITE_P3_USER_ID ?? "")
  const [loginError, setLoginError] = useState("")
  const [apiError, setApiError] = useState("")
  const [apiLoading, setApiLoading] = useState(false)
  const [hasNoEvents, setHasNoEvents] = useState(false)
  const [events, setEvents] = useState<EventRecord[]>([])
  const [backendHealth, setBackendHealth] = useState<ApiHealth | null>(null)
  const [eventId, setEventId] = useState<number | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [activityLog, setActivityLog] = useState<TimelineRecord[]>([])
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [forecasts, setForecasts] = useState<ForecastZone[]>([])
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null)
  const [strategySets, setStrategySets] = useState<StrategySet[]>([])
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [actionSaving, setActionSaving] = useState(false)
  const [selectedNode, setSelectedNode] = useState("A")

  const themeClasses = (classes: string) => {
    const addThemeTransition = (value: string) =>
      /\b(?:bg|text|border|hover:bg|hover:border)-slate-/.test(value) &&
      !value.includes("transition-colors")
        ? `${value} transition-colors duration-300`
        : value

    if (isDark) {
      return addThemeTransition(classes)
    }

    const lightClasses = classes
      .replace(/\bbg-slate-950\b/g, "bg-slate-100")
      .replace(/\bbg-slate-900\b/g, "bg-white shadow-sm")
      .replace(/\bbg-slate-800\/60\b/g, "bg-slate-50")
      .replace(/\bbg-slate-800\/50\b/g, "bg-slate-50")
      .replace(/\bhover:bg-slate-800\b/g, "hover:bg-slate-100")
      .replace(/\bhover:bg-slate-700\b/g, "hover:bg-slate-200")
      .replace(/\bbg-slate-800\b/g, "bg-slate-50")
      .replace(/\bbg-slate-700\b/g, "bg-slate-200")
      .replace(/\bbg-slate-600\b/g, "bg-slate-400")
      .replace(/\bborder-slate-800\b/g, "border-slate-200")
      .replace(/\bborder-slate-700\b/g, "border-slate-300")
      .replace(/\btext-slate-400\b/g, "text-slate-600")
      .replace(/\btext-slate-300\b/g, "text-slate-700")
      .replace(/\btext-slate-200\b/g, "text-slate-800")

    return addThemeTransition(lightClasses)
  }

  const networkCapacity = dashboard?.stats.network_capacity_pct ?? null
  const forecastChartZone = forecasts.find((zone) => zone.forecast_points.length > 1)
  const forecastChartCoordinates = forecastChartZone
    ? forecastChartZone.forecast_points
        .filter((point) => point.predicted_occupancy_pct !== null)
        .map((point) => {
          const maxHorizon = Math.max(...forecastChartZone.forecast_points.map((item) => item.horizon_seconds), 1)
          const occupancy = Math.max(0, Math.min(point.predicted_occupancy_pct ?? 0, 100))
          return {
            x: 50 + (point.horizon_seconds / maxHorizon) * 510,
            y: 180 - (occupancy / 100) * 160,
          }
        })
    : []
  const zones = dashboard?.zones ?? []
  const zoneByName = (name: string) => zones.find((zone) => zone.name.toLowerCase() === name.toLowerCase())
  const northGateCrowd = zoneByName("North Gate")?.occupancy_pct ?? null
  const zoneForNode = (node: string) =>
    zoneByName(({ A: "North Gate", B: "Central Zone", C: "East Zone", D: "Transit" } as const)[node as "A" | "B" | "C" | "D"] ?? "")
  const formatPercent = (value: number | null | undefined) =>
    value == null ? "No data" : `${Math.round(value)}%`
  const selectedStrategySet = strategySets.find(
    (strategySet) => String(strategySet.strategy_set_id) === selectedStrategy,
  )

  const refreshBackendData = async (id: number) => {
    try {
      const [dashboardData, alertData, timelineData, settingsData, forecastData, recommendationData, strategyData] =
        await Promise.all([
          eventApi.getDashboard(id),
          eventApi.getAlerts(id),
          eventApi.getTimeline(id),
          eventApi.getSettings(id),
          eventApi.getForecast(id),
          eventApi.getRecommendation(id),
          eventApi.getStrategySets(id),
        ])
      setDashboard(dashboardData)
      setAlerts(alertData)
      setActivityLog(timelineData)
      setSettings(settingsData)
      setForecasts(forecastData.zones)
      setRecommendation(recommendationData)
      setStrategySets(strategyData)
      setEvents((current) => current.map((event) => event.event_id === id ? dashboardData.event : event))
      setEventName(settingsData.event_name)
      setMaxCapacity(settingsData.max_capacity)
      setAlertThreshold(settingsData.alert_threshold)
      setAutoAlerts(settingsData.auto_ai_alerts)
      setExecutionStatus(
        dashboardData.execution.status === "Ready"
          ? "Ready"
          : dashboardData.execution.status.toLowerCase(),
      )
      setApiError("")
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to load event data.")
    }
  }

  useEffect(() => {
    if (eventId === null || !isLoggedIn) return
    const initialRefresh = setTimeout(() => void refreshBackendData(eventId), 0)
    const interval = setInterval(() => void refreshBackendData(eventId), 10000)
    return () => {
      clearTimeout(initialRefresh)
      clearInterval(interval)
    }
  }, [eventId, isLoggedIn])

  const handleLogin = async () => {
    setApiLoading(true)
    setLoginError("")
    setApiUserId(backendUserId)
    try {
      const [health, availableEvents] = await Promise.all([eventApi.getHealth(), eventApi.listEvents()])
      setBackendHealth(health)
      setEvents(availableEvents)
      if (availableEvents.length === 0) {
        setHasNoEvents(true)
        return
      }
      setHasNoEvents(false)
      setEventId(availableEvents[0].event_id)
      setIsLoggedIn(true)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Could not connect to the EventFlow API.")
    } finally {
      setApiLoading(false)
    }
  }

  const handleCreateStarterEvent = async () => {
    setApiLoading(true)
    setLoginError("")
    try {
      const start = new Date()
      const end = new Date(start.getTime() + 8 * 60 * 60 * 1000)
      const createdEvent = await eventApi.createEvent({
        name: eventName,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
      setEvents([createdEvent])
      setEventId(createdEvent.event_id)
      setHasNoEvents(false)
      setIsLoggedIn(true)
      const starterNodes = [
        { name: "North Gate", type: "GATE", capacity: 5000, status: "OPEN" },
        { name: "Central Zone", type: "ZONE", capacity: 30000, status: "OPEN" },
        { name: "East Zone", type: "ZONE", capacity: 10000, status: "OPEN" },
        { name: "Transit", type: "TRANSIT", capacity: 5000, status: "OPEN" },
      ]
      for (const node of starterNodes) {
        await eventApi.createNode(createdEvent.event_id, node)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the starter event."
      setLoginError(message)
      setApiError(message)
    } finally {
      setApiLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    if (eventId === null) return
    setSettingsSaving(true)
    try {
      const updated = await eventApi.updateSettings(eventId, {
        event_name: eventName,
        max_capacity: maxCapacity,
        alert_threshold: alertThreshold,
        auto_ai_alerts: autoAlerts,
      })
      setSettings(updated)
      setEventName(updated.event_name)
      setApiError("")
      await refreshBackendData(eventId)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not save settings.")
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleReviewStrategy = async () => {
    if (!selectedStrategySet) return
    setActionSaving(true)
    try {
      if (selectedStrategySet.simulation_result_id !== null) {
        setSimulationResult(await eventApi.getSimulation(selectedStrategySet.strategy_set_id))
      } else {
        await eventApi.simulateStrategySet(selectedStrategySet.strategy_set_id)
        setSimulationResult(await eventApi.getSimulation(selectedStrategySet.strategy_set_id))
      }
      setReviewOpen(true)
      if (eventId !== null) await refreshBackendData(eventId)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not simulate this strategy.")
    } finally {
      setActionSaving(false)
    }
  }

  const handleApproveStrategy = async () => {
    if (!selectedStrategySet) return
    setActionSaving(true)
    try {
      await eventApi.approveStrategySet(selectedStrategySet.strategy_set_id)
      setStrategyApproved(true)
      setReviewOpen(false)
      setSandboxOpen(false)
      if (eventId !== null) await refreshBackendData(eventId)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not approve this strategy.")
    } finally {
      setActionSaving(false)
    }
  }

  const handleShareMap = async () => {
    const mapData = `EventFlow Crowd Map\n\n${zones
      .map((zone) => `${zone.name}: ${zone.current_crowd ?? "No data"} people (${formatPercent(zone.occupancy_pct)})`)
      .join("\n")}`
    try {
      await navigator.clipboard.writeText(mapData)
      window.alert("Crowd map copied successfully!")
    } catch {
      setApiError("Could not access the clipboard in this browser.")
    }
  }

  useEffect(() => {
  const timer = setInterval(() => {
    setCurrentTime(new Date())
  }, 1000)

  return () => clearInterval(timer)
}, []) 
    
  if (!isLoggedIn) {
  return (
    <div className={themeClasses("min-h-screen bg-slate-950 flex items-center justify-center p-6 transition-colors duration-300")}>
      <div className={themeClasses("w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8")}>
        <h1 className={`text-3xl font-bold text-center ${isDark ? "text-white" : "text-slate-900"}`}>
          EventFlow
        </h1>

        <p className={themeClasses("text-slate-400 text-center mt-2")}>
          Connect to the EventFlow API
        </p>

        <div className={themeClasses("mt-8 space-y-4")}>
          <div>
            <label className={themeClasses("text-sm text-slate-300")}>Backend development user ID</label>
            <input
              type="number"
              min="1"
              placeholder="Set VITE_P3_USER_ID or enter an ID"
              value={backendUserId}
              onChange={(e) => setBackendUserId(e.target.value)}
              className={`w-full mt-2 rounded-lg px-4 py-3 outline-none focus:border-blue-500 ${themeClasses("bg-slate-800 border border-slate-700")} ${isDark ? "text-white" : "text-slate-900"}`}
            />
          </div>

          <p className={themeClasses("text-xs text-slate-500")}>
            The backend currently uses the X-User-Id development header; it does not provide email/password login.
          </p>

          {loginError && (
            <p className={themeClasses("text-red-400 text-sm")}>{loginError}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={apiLoading}
            className={themeClasses("w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-3 font-semibold text-white")}
          >
            {apiLoading ? "Connecting..." : "Connect"}
          </button>

          {hasNoEvents && (
            <div className={themeClasses("space-y-3 border-t border-slate-800 pt-4")}>
              <p className={themeClasses("text-sm text-slate-400")}>
                No events are stored yet. Create the starter event and venue nodes to continue. No crowd data will be generated.
              </p>
              <button
                onClick={handleCreateStarterEvent}
                disabled={apiLoading}
                className={themeClasses("w-full bg-green-600 hover:bg-green-500 rounded-lg py-3 font-semibold text-white")}
              >
                Create Starter Event
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

  // Existing dashboard starts here
  return (
    <div
  className={`min-h-screen flex flex-col md:flex-row transition-colors duration-300 ${
    isDark
      ? "bg-slate-950 text-white"
      : "bg-slate-100 text-slate-900"
  }`}
>

      {/* ==================== SIDEBAR ==================== */}
     <aside
  className={`w-full md:w-64 border-b md:border-b-0 md:border-r p-5 transition-colors duration-300 ${
    isDark
      ? "bg-slate-900 border-slate-800"
      : "bg-white border-slate-200"
  }`}
>
        <div className={themeClasses("mb-8")}>
          <h1 className={themeClasses("text-2xl font-bold")}>EventFlow</h1>
          <p className={themeClasses("text-sm text-slate-400 mt-1")}>
            Command Center
          </p>
        </div>

        <nav className={themeClasses("space-y-2")}>
          {[
            "Overview",
            "Crowd Monitor",
            "Predictions",
            "Sandbox",
            "Strategies",
             "Settings",
          ].map((item) => (
            <button
              key={item}
              onClick={() => {
                setActivePage(item)

                if (item === "Sandbox") {
                  setSandboxOpen(true)
                }
              }}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors duration-300 ${
  activePage === item
    ? "bg-blue-600 text-white"
    : isDark
    ? "text-slate-300 hover:bg-slate-800"
    : "text-slate-700 hover:bg-slate-100"
}`}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className={themeClasses("mt-10 border-t border-slate-800 pt-5")}>
          <p className={themeClasses("text-xs text-slate-500 uppercase")}>
            System
          </p>

          <div className={themeClasses("flex items-center gap-2 mt-3")}>
            <div className={themeClasses("w-2.5 h-2.5 rounded-full bg-green-400")} />
            <span className={themeClasses("text-sm text-slate-300")}>
              {backendHealth?.status === "ok" ? "Backend connected" : "Backend status unavailable"}
            </span>
          </div>
        </div>

      </aside>


      {/* ==================== MAIN CONTENT ==================== */}
      <main className={themeClasses("flex-1 p-8")}>

        {/* Header */}
        <header className={themeClasses("flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8")}>

          <div>
            <p className={themeClasses("text-sm text-blue-400 font-medium")}>
              LIVE EVENT
            </p>

            <h2 className={themeClasses("text-3xl font-bold mt-1")}>
                {eventName}
            </h2>

            <p className={themeClasses("text-slate-400 mt-1")}>
              Organizer Command Center · Monitoring live conditions
            </p>
          </div>

          <div className={themeClasses("flex flex-wrap items-center justify-end gap-3")}>

  <div className={themeClasses("text-right")}>
    <p className={themeClasses("text-xs text-slate-400")}>LOCAL TIME</p>
    <p className={themeClasses("font-semibold")}>
      {currentTime.toLocaleTimeString()}
    </p>
  </div>

  {events.length > 1 && (
    <select
      value={eventId ?? ""}
      onChange={(event) => setEventId(Number(event.target.value))}
      aria-label="Select event"
      className={themeClasses("rounded-lg border border-slate-700 bg-slate-800 px-3 py-2")}
    >
      {events.map((event) => <option key={event.event_id} value={event.event_id}>{event.name}</option>)}
    </select>
  )}

  <div className={themeClasses("px-4 py-2 rounded-lg border border-slate-700 bg-slate-900")}>
    <span className={themeClasses("text-sm text-slate-400")}>Status</span>
    <span className={themeClasses(`ml-2 font-medium ${dashboard?.event.status === "ACTIVE" ? "text-green-400" : "text-yellow-400"}`)}>
      {dashboard?.event.status ?? "CONNECTING"}
    </span>
  </div>

  <button
    type="button"
    onClick={() => setIsDark((current) => !current)}
    aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    title={`Switch to ${isDark ? "light" : "dark"} mode`}
    className={`px-3 py-2 rounded-lg border transition-colors duration-300 ${themeClasses("border-slate-700 bg-slate-800 hover:bg-slate-700")}`}
  >
    {isDark ? "☀️" : "🌙"}
  </button>

  <button
    onClick={() => setSandboxOpen(true)}
    className={themeClasses("px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium")}
  >
    Open Sandbox
  </button>

  <div className={themeClasses("relative")}>
    <button className={themeClasses("p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xl")}>
      🔔
    </button>

    <span className={themeClasses("absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center")}>
      {alerts.length}
    </span>
  </div>

  <div className={themeClasses("w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold")}>
    O
  </div>

</div>
          
        </header>

                {apiError && (
                  <div className={themeClasses("mb-6 flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300")} role="alert">
                    <span>{apiError}</span>
                    {eventId !== null && (
                      <button onClick={() => void refreshBackendData(eventId)} className={themeClasses("font-semibold underline")}>
                        Retry
                      </button>
                    )}
                  </div>
                )}


        {/* ==================== STATS ==================== */}
        <section className={themeClasses("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6")}>

          {/* Crowd Level */}
<div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
  <div className={themeClasses("flex items-center justify-between")}>
    <span className={themeClasses("text-2xl")}>👥</span>
    <span className={themeClasses("text-xs text-red-400")}>
      {dashboard?.stats.crowd_level_pct == null ? "NO DATA" : dashboard.stats.crowd_level_pct >= alertThreshold ? "ABOVE THRESHOLD" : "WITHIN THRESHOLD"}
    </span>
  </div>

  <p className={themeClasses("text-slate-400 text-sm mt-5")}>Crowd Level</p>

  <p className={themeClasses("text-3xl font-bold mt-1")}>
    {formatPercent(dashboard?.stats.crowd_level_pct)}
  </p>
</div>

{/* Live Visitors */}
<div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
  <div className={themeClasses("flex items-center justify-between")}>
    <span className={themeClasses("text-2xl")}>🎟️</span>
    <span className={themeClasses("text-xs text-green-400")}>LIVE</span>
  </div>

  <p className={themeClasses("text-slate-400 text-sm mt-5")}>Live Visitors</p>

  <p className={themeClasses("text-3xl font-bold mt-1")}>
    {zones.some((zone) => zone.current_crowd !== null) ? dashboard?.stats.live_visitors.toLocaleString() : "No data"}
  </p>

  <p className={themeClasses("text-green-400 text-xs mt-2")}>
    {zones.some((zone) => zone.crowd_updated_at) ? "Backend live state" : "Awaiting crowd ingestion"}
  </p>
</div>

{/* Network Capacity */}
<div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
  <div className={themeClasses("flex items-center justify-between")}>
    <span className={themeClasses("text-2xl")}>🚌</span>
    <span className={themeClasses("text-xs text-blue-400")}>{networkCapacity == null ? "NO DATA" : "STORED"}</span>
  </div>

  <p className={themeClasses("text-slate-400 text-sm mt-5")}>Network Capacity</p>

  <p className={themeClasses("text-3xl font-bold mt-1")}>
    {formatPercent(networkCapacity)}
  </p>
</div>

{/* Risk Level */}
<div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
  <div className={themeClasses("flex items-center justify-between")}>
    <span className={themeClasses("text-2xl")}>🛡️</span>
    <span className={themeClasses("text-xs text-yellow-400")}>UNAVAILABLE</span>
  </div>

  <p className={themeClasses("text-slate-400 text-sm mt-5")}>Risk Level</p>

  <p className={themeClasses("text-3xl font-bold mt-1")}>
    {dashboard?.stats.risk_level ?? "Unavailable"}
  </p>
</div>

        </section>


        {/* ==================== OVERVIEW ==================== */}
        {activePage === "Overview" && (
          <>
            <section className={themeClasses("grid grid-cols-1 xl:grid-cols-3 gap-6")}>

              {/* Live Crowd Map */}
              <div className={themeClasses("xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5")}>

                <div className={themeClasses("flex items-center justify-between mb-4")}>

                  <div>
                    <h3 className={themeClasses("text-lg font-semibold")}>
                      Live Crowd Map
                    </h3>

                    <p className={themeClasses("text-sm text-slate-400")}>
                      Current crowd distribution across event zones
                    </p>
                    {selectedStrategy && (
                      <span className={themeClasses("inline-block mt-2 text-xs text-blue-300")}>
                       Selected strategy set: #{selectedStrategy}
                      </span>
                    )}
                  </div>

                  <div className={themeClasses("flex items-center gap-2")}>
  <span className={themeClasses("text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400")}>
    {simulationResult ? "SIMULATION RESULT" : "LIVE DATA"}
  </span>

  <button
    onClick={handleShareMap}
    className={themeClasses("text-xs px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-500")}
  >
    Share Map
  </button>
</div>

                </div>

              <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>

 <svg viewBox="0 0 600 320" className={themeClasses("w-full h-auto map")}>
  {/* Background */}
  <rect width="600" height="320" rx="18" fill="#EEF5FB" />

  {/* Arabian Sea */}
  <path
    d="M0 0 L85 0 L72 40 L84 90 L68 150 L80 220 L65 320 L0 320 Z"
    fill="#A9D6F5"
  />
  <text x="14" y="160" fontSize="12" fill="#0369A1" fontWeight="700">
    Arabian Sea
  </text>

  {/* PARK */}
  <rect x="355" y="18" width="95" height="48" rx="12" fill="#D8F5D6" />
  <text
    x="402"
    y="45"
    textAnchor="middle"
    fontSize="10"
    fill="#166534"
    fontWeight="600"
  >
    Park
  </text>

  {/* GARDEN */}
  <rect x="155" y="205" width="95" height="46" rx="12" fill="#DCFCE7" />
  <text
    x="202"
    y="232"
    textAnchor="middle"
    fontSize="10"
    fill="#166534"
    fontWeight="600"
  >
    Garden
  </text>

  {/* FOOD COURT */}
  <rect
    x="145"
    y="88"
    width="105"
    height="60"
    rx="12"
    fill="#FDE7C7"
    stroke="#FB923C"
    strokeWidth="1.5"
  />
  <text x="197" y="108" textAnchor="middle" fontSize="18">
    🍴
  </text>
  <text
    x="197"
    y="128"
    textAnchor="middle"
    fontSize="10"
    fill="#9A3412"
    fontWeight="700"
  >
    Food Court
  </text>

  {/* PARKING */}
  <rect
    x="125"
    y="255"
    width="95"
    height="42"
    rx="10"
    fill="#DCE7F7"
    stroke="#60A5FA"
    strokeWidth="1.5"
  />
  <text x="172" y="272" textAnchor="middle" fontSize="18">
    🅿
  </text>
  <text
    x="172"
    y="286"
    textAnchor="middle"
    fontSize="10"
    fill="#1D4ED8"
    fontWeight="700"
  >
    Parking
  </text>

  {/* ================= ROADS ================= */}

  {/* White roads */}
  <g stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" fill="none">
    {/* Marine Drive (moved below food court) */}
    <path d="M95 245 C160 185,255 165,470 175" />

    {/* Metro Line */}
    <path d="M245 20 L242 170 L295 225" />

    {/* Transit Road */}
    <path d="M430 250 L445 170 L420 20" />
  </g>

  {/* Dashed road markings */}
  <g stroke="#CBD5E1" strokeWidth="2" strokeDasharray="6 6" fill="none">
    <path d="M95 245 C160 185,255 165,470 175" />
    <path d="M245 20 L242 170 L295 225" />
    <path d="M430 250 L445 170 L420 20" />
  </g>

  {/* Road labels */}
  <g fontSize="9" fill="#64748B" fontWeight="700">
    <text x="228" y="158">
      Marine Drive
    </text>
    <text transform="translate(252 92) rotate(-90)">Metro Line</text>
    <text transform="translate(455 135) rotate(-78)">Transit Road</text>
  </g>

  {/* Pedestrian connections */}
  <g stroke="#64748B" strokeWidth="1.5" strokeDasharray="4 5">
    <line x1="235" y1="70" x2="330" y2="170" />
    <line x1="430" y1="90" x2="330" y2="170" />
    <line x1="430" y1="250" x2="330" y2="170" />
  </g>

  {/* ================= STAGE ================= */}

  <ellipse
    cx="330"
    cy="170"
    rx="55"
    ry="36"
    fill="#DBEAFE"
    stroke="#3B82F6"
    strokeWidth="2"
  />
  <ellipse cx="330" cy="170" rx="42" ry="26" fill="#3B82F6" />

  {/* Hover expansion */}
  {selectedNode === "B" && (
    <>
      <ellipse
        cx="330"
        cy="170"
        rx="68"
        ry="44"
        fill="none"
        stroke="#60A5FA"
        strokeWidth="2"
        opacity="0.6"
      />
      <text
        x="330"
        y="152"
        textAnchor="middle"
        fontSize="11"
        fill="white"
        fontWeight="700"
      >
        STAGE
      </text>
    </>
  )}

  {/* ================= GATE LABELS ================= */}

  <g>
    <rect x="145" y="18" width="84" height="24" rx="8" fill="#1E3A8A" />
    <text
      x="187"
      y="33"
      textAnchor="middle"
      fontSize="9"
      fill="white"
      fontWeight="700"
    >
      North Gate
    </text>

    <rect x="420" y="18" width="82" height="24" rx="8" fill="#1E3A8A" />
    <text
      x="461"
      y="33"
      textAnchor="middle"
      fontSize="9"
      fill="white"
      fontWeight="700"
    >
      East Gate
    </text>

    <rect x="245" y="286" width="84" height="24" rx="8" fill="#1E3A8A" />
    <text
      x="287"
      y="301"
      textAnchor="middle"
      fontSize="9"
      fill="white"
      fontWeight="700"
    >
      South Gate
    </text>
  </g>

  {/* ================= NODE A ================= */}
  <g onClick={() => setSelectedNode("A")} style={{ cursor: "pointer" }}>
    <circle
      cx="235"
      cy="70"
      r="18"
      fill={selectedNode === "A" ? "#DC2626" : "#F87171"}
      stroke="white"
      strokeWidth="3"
    />
    <text
      x="235"
      y="75"
      textAnchor="middle"
      fontSize="11"
      fill="white"
      fontWeight="700"
    >
      A
    </text>

    <rect
      x="185"
      y="92"
      width="100"
      height="20"
      rx="8"
      fill="rgba(255,255,255,.82)"
    />
    <text
      x="235"
      y="105"
      textAnchor="middle"
      fontSize="9"
      fill="#7F1D1D"
      fontWeight="600"
    >
      North Gate
    </text>
  </g>

  {/* ================= NODE B ================= */}
  <g onClick={() => setSelectedNode("B")} style={{ cursor: "pointer" }}>
    <circle
      cx="330"
      cy="170"
      r={selectedNode === "B" ? 26 : 22}
      fill={selectedNode === "B" ? "#2563EB" : "#60A5FA"}
      stroke="white"
      strokeWidth="3"
      style={{ transition: "0.25s" }}
    />
    <text
      x="330"
      y="176"
      textAnchor="middle"
      fontSize="11"
      fill="white"
      fontWeight="700"
    >
      B
    </text>

    <rect
      x="278"
      y="198"
      width="104"
      height="20"
      rx="8"
      fill="rgba(255,255,255,.82)"
    />
    <text
      x="330"
      y="211"
      textAnchor="middle"
      fontSize="9"
      fill="#1D4ED8"
      fontWeight="600"
    >
      Central Zone
    </text>
  </g>

  {/* ================= NODE C ================= */}
  <g onClick={() => setSelectedNode("C")} style={{ cursor: "pointer" }}>
    <circle
      cx="430"
      cy="90"
      r="18"
      fill={selectedNode === "C" ? "#16A34A" : "#4ADE80"}
      stroke="white"
      strokeWidth="3"
    />
    <text
      x="430"
      y="95"
      textAnchor="middle"
      fontSize="11"
      fill="white"
      fontWeight="700"
    >
      C
    </text>

    <rect
      x="380"
      y="112"
      width="100"
      height="20"
      rx="8"
      fill="rgba(255,255,255,.82)"
    />
    <text
      x="430"
      y="125"
      textAnchor="middle"
      fontSize="9"
      fill="#166534"
      fontWeight="600"
    >
      East Zone
    </text>
  </g>

  {/* ================= NODE D ================= */}
  <g onClick={() => setSelectedNode("D")} style={{ cursor: "pointer" }}>
    <circle
      cx="430"
      cy="250"
      r="18"
      fill={selectedNode === "D" ? "#0EA5E9" : "#38BDF8"}
      stroke="white"
      strokeWidth="3"
    />
    <text
      x="430"
      y="255"
      textAnchor="middle"
      fontSize="11"
      fill="white"
      fontWeight="700"
    >
      D
    </text>

    <rect
      x="380"
      y="272"
      width="100"
      height="20"
      rx="8"
      fill="rgba(255,255,255,.82)"
    />
    <text
      x="430"
      y="285"
      textAnchor="middle"
      fontSize="9"
      fill="#075985"
      fontWeight="600"
    >
      Transit Hub
    </text>
  </g>

  {/* ================= LEGEND ================= */}
  <g transform="translate(475 205)">
    <rect
      width="110"
      height="95"
      rx="10"
      fill="rgba(255,255,255,.92)"
      stroke="#D1D5DB"
    />

    <line
      x1="10"
      y1="18"
      x2="28"
      y2="18"
      stroke="#64748B"
      strokeDasharray="4 4"
      strokeWidth="2"
    />
    <text x="35" y="21" fontSize="8" fill="#334155">
      Paths
    </text>

    <rect x="10" y="30" width="10" height="10" rx="2" fill="#D8F5D6" />
    <text x="35" y="38" fontSize="8" fill="#334155">
      Park
    </text>

    <rect x="10" y="46" width="10" height="10" rx="2" fill="#FDE7C7" />
    <text x="35" y="54" fontSize="8" fill="#334155">
      Food
    </text>

    <rect x="10" y="62" width="10" height="10" rx="2" fill="#DCE7F7" />
    <text x="35" y="70" fontSize="8" fill="#334155">
      Parking
    </text>

    <circle cx="15" cy="84" r="5" fill="#2563EB" />
    <text x="35" y="87" fontSize="8" fill="#334155">
      Zone
    </text>
  </g>

  {/* Compass */}
  <g transform="translate(555 18)">
    <circle r="12" fill="white" stroke="#64748B" />
    <path d="M0 -8 L3 3 L0 1 L-3 3 Z" fill="#1E40AF" />
    <text
      y="-16"
      textAnchor="middle"
      fontSize="7"
      fill="#334155"
      fontWeight="700"
    >
      N
    </text>
  </g>
</svg>

  <div className={themeClasses("mt-4 bg-slate-900 rounded-lg p-4")}>
    <p className={themeClasses("text-xs text-slate-400 uppercase")}>Selected Node</p>

    <h4 className={themeClasses("text-lg font-semibold mt-1")}>
      {selectedNode === "A" && "North Gate"}
      {selectedNode === "B" && "Central Zone"}
      {selectedNode === "C" && "East Zone"}
      {selectedNode === "D" && (zoneByName("Transit")?.name ?? "Transit")}
    </h4>

    <div className={themeClasses("grid grid-cols-3 gap-3 mt-3")}>
      <div>
        <p className={themeClasses("text-xs text-slate-500")}>Utilization</p>
        <p className={themeClasses("font-bold")}>
          {formatPercent(zoneForNode(selectedNode)?.occupancy_pct)}
        </p>
      </div>

      <div>
        <p className={themeClasses("text-xs text-slate-500")}>Status</p>
        <p className={themeClasses("font-bold")}>
          {zoneForNode(selectedNode)?.above_threshold
            ? "Above threshold"
            : zoneForNode(selectedNode)?.current_crowd == null
            ? "Unavailable"
            : "Within threshold"}
        </p>
      </div>

      <div>
        <p className={themeClasses("text-xs text-slate-500")}>Node</p>
        <p className={themeClasses("font-bold")}>{zoneForNode(selectedNode)?.node_id ?? "—"}</p>
      </div>
    </div>
  </div>

</div>

                </div>
            


              {/* Predictive Alerts */}
              <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>

                <h3 className={themeClasses("text-lg font-semibold")}>
                  Predictive Alerts
                </h3>

                <p className={themeClasses("text-sm text-slate-400 mt-1 mb-5")}>
                  Issues requiring attention
                </p>

                <div className={themeClasses("space-y-4")}>

                  {alerts.map((alert) => (
  <div
    key={`${alert.source}-${alert.ref_id}`}
    className={themeClasses("border border-slate-800 rounded-lg p-4 space-y-2")}
  >
    <div className={themeClasses("flex justify-between items-start")}>
      <div>
        <p className={themeClasses("text-xs text-blue-400 font-medium")}>
          {alert.source.replaceAll("_", " ")}
        </p>

        <h4 className={themeClasses("font-semibold mt-1")}>
          {alert.title}
        </h4>
      </div>

      <span
        className={`text-xs px-2 py-1 rounded ${
          alert.level === "HIGH"
            ? "bg-red-500/10 text-red-400"
            : alert.level === "MEDIUM"
            ? "bg-yellow-500/10 text-yellow-400"
            : "bg-green-500/10 text-green-400"
        }`}
      >
        {alert.level}
      </span>
    </div>

    <p className={themeClasses("text-sm text-slate-300")}>
      📍 {alert.location ?? "Event"}
    </p>

    <p className={themeClasses("text-xs text-slate-500")}>
      🕒 {new Date(alert.created_at).toLocaleString()}
    </p>
  </div>
))}
                  {alerts.length === 0 && (
                    <p className={themeClasses("text-sm text-slate-500")}>No alerts are currently reported by the backend.</p>
                  )}

                </div>
              </div>

            </section>


            {/* ==================== EXECUTION STATUS ==================== */}
            <div className={themeClasses("mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6")}>

              <div className={themeClasses("flex items-center justify-between")}>

                <div>

                  <p className={themeClasses("text-blue-400 text-sm font-medium")}>
                    EXECUTION STATUS
                  </p>

                  <h3 className={themeClasses("text-xl font-semibold mt-1")}>
                    {executionStatus.toUpperCase() === "EXECUTING"
                      ? `Strategy ${selectedStrategy} is being executed`
                      : executionStatus.toUpperCase() === "COMPLETED"
                      ? `Strategy ${selectedStrategy} execution completed`
                      : executionStatus === "Ready"
                      ? "No active strategy"
                      : `Execution status: ${executionStatus}`}
                  </h3>

                  <p className={themeClasses("text-sm text-slate-400 mt-2")}>
                    {executionStatus.toUpperCase() === "EXECUTING"
                      ? "Operational changes are being monitored in real time."
                      : "Execution state is supplied by the backend."}
                  </p>

                </div>

                <div className={themeClasses("flex items-center gap-3")}>

                  <div
                    className={`w-3 h-3 rounded-full ${
                      executionStatus.toUpperCase() === "EXECUTING"
                        ? "bg-blue-400 animate-pulse"
                        : isDark ? "bg-slate-600" : "bg-slate-300"
                    }`}
                  />

                  <span className={themeClasses("font-medium")}>
                    {executionStatus}
                  </span>

                </div>

              </div>


            </div>

            {/* Activity Timeline */}
        <div className={themeClasses("mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6")}>

          <div className={themeClasses("flex items-center justify-between mb-5")}>

            <div>
              <p className={themeClasses("text-blue-400 text-sm font-medium")}>
                ACTIVITY
              </p>

              <h3 className={themeClasses("text-xl font-semibold mt-1")}>
                Event Timeline
              </h3>
            </div>

            <span className={themeClasses("text-xs text-slate-500")}>
              LIVE
            </span>

          </div>

          <div className={themeClasses("space-y-4")}>

            {activityLog.map((activity, index) => (
              <div
                key={`${activity.source}-${activity.ref_id}-${index}`}
                className={themeClasses("flex items-start gap-4")}
              >

                <div
                  className={`w-2.5 h-2.5 rounded-full mt-2 ${
                    activity.type === "alert"
                      ? "bg-red-400"
                      : activity.type === "success"
                      ? "bg-green-400"
                      : "bg-yellow-400"
                  }`}
                />

                <div className={themeClasses("flex-1")}>

                  <p className={themeClasses("text-sm text-slate-200")}>
                    {activity.message}
                  </p>

                  <p className={themeClasses("text-xs text-slate-500 mt-1")}>
                    {new Date(activity.created_at).toLocaleString()}
                  </p>

                </div>

              </div>
            ))}
            {activityLog.length === 0 && (
              <p className={themeClasses("text-sm text-slate-500")}>No timeline activity is stored for this event.</p>
            )}

          </div>

        </div>

          </>
        )}


        {/* ==================== CROWD MONITOR ==================== */}
        {activePage === "Crowd Monitor" && (
          <section className={themeClasses("space-y-6")}>

            <div>
              <h3 className={themeClasses("text-2xl font-bold")}>
                Crowd Monitor
              </h3>

              <p className={themeClasses("text-slate-400 mt-1")}>
                Monitor crowd density across every event zone.
              </p>
            </div>


            <div className={themeClasses("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4")}>

             {zones.map((zone) => (
                <div
                  key={zone.node_id}
                  className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}
                >

                  <p className={themeClasses("text-slate-400 text-sm")}>
                    {zone.name}
                  </p>

                  <p className={themeClasses("text-3xl font-bold mt-2")}>
                    {formatPercent(zone.occupancy_pct)}
                  </p>

                  <span
                    className={`inline-block mt-3 text-xs px-2 py-1 rounded ${
                      zone.above_threshold
                        ? "bg-red-500/10 text-red-400"
                        : "bg-green-500/10 text-green-400"
                    }`}
                  >
                    {zone.current_crowd == null ? "NO CROWD DATA" : zone.above_threshold ? "ABOVE THRESHOLD" : "WITHIN THRESHOLD"}
                  </span>

                </div>
              ))}

            </div>


            <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>

              <h3 className={themeClasses("text-lg font-semibold")}>Crowd Movement</h3>

              <p className={themeClasses("text-sm text-slate-400 mt-1")}>
                Current edge-flow data is not available from the backend contract.
              </p>
            </div>

          </section>
        )}


        {/* ==================== PREDICTIONS ==================== */}
        {activePage === "Predictions" && (
  <div className={themeClasses("space-y-6")}>

    <div>
      <p className={themeClasses("text-blue-400 text-sm font-medium")}>
        AI CROWD FORECAST
      </p>
      <h2 className={themeClasses("text-3xl font-bold mt-1")}>
        Next 60 Minutes Prediction
      </h2>
      <p className={themeClasses("text-slate-400 mt-2")}>
        Stored prediction output supplied by the crowd engine.
      </p>
    </div>

    {/* Forecast Cards */}
    <div className={themeClasses("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4")}>
      {forecasts.map((zone) => (
        <div key={zone.prediction_id} className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
          <p className={themeClasses("text-slate-400 text-sm")}>{zone.node_name}</p>
          <p className={themeClasses("text-3xl font-bold mt-2")}>{formatPercent(zone.predicted_occupancy_pct)}</p>
          <p className={themeClasses("text-xs text-slate-500 mt-2")}>Horizon: {Math.round(zone.prediction_horizon / 60)} min</p>
        </div>
      ))}
      {forecasts.length === 0 && (
        <p className={themeClasses("text-sm text-slate-500")}>No prediction data has been received from the backend.</p>
      )}
    </div>

    {/* Forecast Timeline */}
    <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>
      <h3 className={themeClasses("text-xl font-semibold mb-5")}>
        Predicted Crowd Growth
      </h3>

      {forecastChartCoordinates.length > 1 ? (
        <svg viewBox="0 0 600 220" className={themeClasses("w-full h-auto")}>
          <line x1="50" y1="20" x2="50" y2="180" stroke="#475569" strokeWidth="1" />
          <line x1="50" y1="180" x2="560" y2="180" stroke="#475569" strokeWidth="1" />
          <polyline
            fill="none"
            stroke="#ef4444"
            strokeWidth="4"
            points={forecastChartCoordinates.map((point) => `${point.x},${point.y}`).join(" ")}
          />
          {forecastChartCoordinates.map((point, index) => (
            <circle key={index} cx={point.x} cy={point.y} r="4" fill="#ef4444" />
          ))}
        </svg>
      ) : (
        <p className={themeClasses("text-sm text-slate-500")}>No forecast series is available from the backend.</p>
      )}

      <div className={themeClasses("mt-4 flex items-center gap-2 text-sm text-slate-400")}>
        <div className={themeClasses("w-4 h-1 bg-red-500 rounded")}/>
        {forecastChartZone ? `${forecastChartZone.node_name} forecast` : "Forecast series"}
      </div>
    </div>

    {/* AI Recommendation */}
    <div className={themeClasses("bg-blue-500/10 border border-blue-500/20 rounded-xl p-5")}>
      <p className={themeClasses("text-blue-300 text-sm font-medium")}>
        {recommendation?.source ?? "P2 RECOMMENDATION"}
      </p>

     <h3 className={themeClasses("text-xl font-semibold mt-2")}>
        {recommendation?.headline ?? "No recommendation is available."}
</h3>
      <button
  onClick={() => setSandboxOpen(true)}
  className={themeClasses("mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium")}
>
  Test Response in Sandbox
</button>

      <p className={themeClasses("text-slate-300 mt-3")}>
        {recommendation?.detail ?? "The backend has not returned recommendation details."}
      </p>
    </div>

  </div>
)}


        {/* ==================== STRATEGIES ==================== */}
        {activePage === "Strategies" && (
          <section className={themeClasses("space-y-6")}>

            <div>

              <h3 className={themeClasses("text-2xl font-bold")}>
                Strategies
              </h3>

              <p className={themeClasses("text-slate-400 mt-1")}>
                Available operational responses.
              </p>

            </div>


            <div className={themeClasses("grid grid-cols-1 lg:grid-cols-2 gap-5")}>
              {strategySets.map((strategySet) => (
                <article key={strategySet.strategy_set_id} className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>
                  <div className={themeClasses("flex justify-between gap-4")}>
                    <h3 className={themeClasses("text-lg font-semibold")}>
                      {strategySet.name ?? `Strategy Set #${strategySet.strategy_set_id}`}
                    </h3>
                    <span className={themeClasses("text-xs text-blue-400")}>{strategySet.status}</span>
                  </div>
                  <p className={themeClasses("text-slate-400 text-sm mt-3")}>
                    {strategySet.description ?? strategySet.strategies.map((strategy) => strategy.action).join("; ")}
                  </p>
                  <p className={themeClasses("text-xs text-slate-500 mt-3")}>
                    Risk: {strategySet.risk_level ?? "Not supplied"} · Attempts: {strategySet.attempt_count}
                  </p>
                  <button
                    onClick={() => {
                      setSelectedStrategy(String(strategySet.strategy_set_id))
                      setSimulationResult(null)
                      setSandboxOpen(true)
                    }}
                    className={themeClasses("mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium")}
                  >
                    Open in Sandbox
                  </button>
                </article>
              ))}
              {strategySets.length === 0 && (
                <p className={themeClasses("text-sm text-slate-500")}>No strategy sets have been supplied for this event.</p>
              )}
            </div>

          </section>
        )}
        {activePage === "Settings" && (
  <section className={themeClasses("space-y-6")}>
    <div>
      <p className={themeClasses("text-blue-400 text-sm font-medium")}>
        ORGANIZER SETTINGS
      </p>

      <h2 className={themeClasses("text-3xl font-bold mt-1")}>
        System Configuration
      </h2>

      <p className={themeClasses("text-slate-400 mt-2")}>
        Configure event parameters and alert behavior.
      </p>
      {settings?.updated_at && (
        <p className={themeClasses("text-xs text-slate-500 mt-2")}>
          Last saved {new Date(settings.updated_at).toLocaleString()}
        </p>
      )}
    </div>

    <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5")}>

      <div>
        <label className={themeClasses("block text-sm text-slate-400 mb-2")}>
          Event Name
        </label>

        <input
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          className={themeClasses("w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500")}
        />
      </div>

      <div>
        <label className={themeClasses("block text-sm text-slate-400 mb-2")}>
          Maximum Capacity
        </label>

        <input
          type="number"
          value={maxCapacity}
          onChange={(e) => setMaxCapacity(Number(e.target.value))}
          className={themeClasses("w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500")}
        />
      </div>

      <div>
        <label className={themeClasses("block text-sm text-slate-400 mb-2")}>
          Alert Threshold ({alertThreshold}%)
        </label>

        <input
          type="range"
          min="60"
          max="100"
          value={alertThreshold}
          onChange={(e) => setAlertThreshold(Number(e.target.value))}
          className={themeClasses("w-full")}
        />
      </div>

      <div className={themeClasses("flex items-center justify-between bg-slate-800 rounded-lg p-4")}>
        <div>
          <p className={themeClasses("font-medium")}>
            Auto AI Alerts
          </p>

          <p className={themeClasses("text-sm text-slate-400")}>
            Automatically generate predictive warnings
          </p>
        </div>

        <button
          onClick={() => setAutoAlerts(!autoAlerts)}
          className={`w-14 h-8 rounded-full transition ${
            autoAlerts ? "bg-blue-600" : isDark ? "bg-slate-600" : "bg-slate-300"
          }`}
        >
          <div
            className={`w-6 h-6 bg-white rounded-full transition transform ${
              autoAlerts ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <button
        onClick={() => void handleSaveSettings()}
        disabled={settingsSaving}
        className={themeClasses("w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium")}
      >
        {settingsSaving ? "Saving..." : "Save Settings"}
      </button>

    </div>
  </section>
)}


{/* ==================== SANDBOX SECTION ==================== */}
{activePage === "Overview" && (
  <section className={themeClasses("mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6")}>

    <div className={themeClasses("flex items-center justify-between")}>
      <div>
        <p className={themeClasses("text-blue-400 text-sm font-medium")}>SANDBOX</p>
        <h3 className={themeClasses("text-xl font-semibold mt-1")}>
          Test a response before taking action
        </h3>
        <p className={themeClasses("text-sm text-slate-400 mt-2")}>
          Review strategy sets supplied for this event and simulate them through the backend.
        </p>
      </div>

      <button
        onClick={() => setSandboxOpen(true)}
        className={themeClasses("px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium")}
      >
        Open Sandbox
      </button>
    </div>

    <div className={themeClasses("mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4")}>

      <div className={themeClasses("bg-slate-800 rounded-lg p-4")}>
        <p className={themeClasses("text-xs text-slate-400")}>Crowd Level</p>
        <p className={themeClasses("text-2xl font-bold mt-2")}>
          {formatPercent(dashboard?.stats.crowd_level_pct)}
        </p>
      </div>

      <div className={themeClasses("bg-slate-800 rounded-lg p-4")}>
        <p className={themeClasses("text-xs text-slate-400")}>North Gate</p>
        <p className={themeClasses("text-2xl font-bold mt-2 text-red-400")}>
          {formatPercent(northGateCrowd)}
        </p>
      </div>

      <div className={themeClasses("bg-slate-800 rounded-lg p-4")}>
        <p className={themeClasses("text-xs text-slate-400")}>Network Capacity</p>
        <p className={themeClasses("text-2xl font-bold mt-2")}>
          {formatPercent(networkCapacity)}
        </p>
      </div>

      <div className={themeClasses("bg-slate-800 rounded-lg p-4")}>
        <p className={themeClasses("text-xs text-slate-400")}>Strategy sets</p>
        <p className={themeClasses("text-2xl font-bold mt-2 text-yellow-400")}>
          {strategySets.length}
        </p>
      </div>

    </div>
  </section>
)}


      {/* ==================== SANDBOX MODAL ==================== */}
      {sandboxOpen && selectedStrategy?.startsWith("legacy:") && (
        <div className={themeClasses("fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50")}>

          <div className={themeClasses("w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-7")}>

            {/* Modal Header */}
            <div className={themeClasses("flex items-center justify-between mb-7")}>

              <div>

                <p className={themeClasses("text-blue-400 text-sm font-medium")}>
                  SANDBOX SIMULATION
                </p>

                <h2 className={themeClasses("text-2xl font-bold mt-1")}>
                  Test a response before taking action
                </h2>

                <p className={themeClasses("text-slate-400 text-sm mt-1")}>
                  Compare possible strategies against the current event conditions.
                </p>

              </div>

              <button
                onClick={() => {
                  setSandboxOpen(false)
                  setSelectedStrategy(null)
                }}
                className={themeClasses("text-slate-400 hover:text-white text-2xl")}
              >
                ×
              </button>

            </div>


            {/* Current Situation */}
            <div className={themeClasses("bg-slate-800/60 rounded-xl p-5 mb-6")}>

              <h3 className={themeClasses("font-semibold mb-4")}>
                Current Situation
              </h3>

              <div className={themeClasses("grid grid-cols-3 gap-4")}>

                <div>

                  <p className={themeClasses("text-sm text-slate-400")}>
                    Crowd Level
                  </p>

                  <p className={themeClasses("text-2xl font-bold mt-1")}>
                    {selectedStrategy === "A"
                      ? "68%"
                      : selectedStrategy === "B"
                      ? "73%"
                      : "78%"}
                  </p>

                </div>


                <div>

                  <p className={themeClasses("text-sm text-slate-400")}>
                    North Gate
                  </p>

                  <p className={themeClasses("text-2xl font-bold text-red-400 mt-1")}>
                    High
                  </p>

                </div>


                <div>

                  <p className={themeClasses("text-sm text-slate-400")}>
                    Network Capacity
                  </p>

                  <p className={themeClasses("text-2xl font-bold mt-1")}>
                    {networkCapacity}%
                  </p>
                </div>

              </div>

            </div>


            {/* Strategies */}
            <div className={themeClasses("grid grid-cols-1 lg:grid-cols-2 gap-5")}>

              {/* Strategy A */}
              <button
                onClick={() => setSelectedStrategy("A")}
                className={`text-left rounded-xl border p-5 transition ${
                  selectedStrategy === "A"
                    ? "border-blue-500 bg-blue-500/10"
                    : isDark
                    ? "border-slate-700 bg-slate-800 hover:border-slate-500"
                    : "border-slate-300 bg-white shadow-sm hover:border-slate-400"
                }`}
              >

                <div className={themeClasses("flex items-center justify-between")}>

                  <h3 className={themeClasses("text-lg font-semibold")}>
                    Strategy A
                  </h3>

                  <span className={themeClasses("text-xs px-2 py-1 rounded bg-green-500/10 text-green-400")}>
                    LOW RISK
                  </span>

                </div>

                <p className={themeClasses("text-slate-300 mt-3")}>
                  Redirect crowd from North Gate toward East Zone.
                </p>

                <div className={themeClasses("grid grid-cols-3 gap-3 mt-5")}>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>
                      Crowd
                    </p>

                    <p className={themeClasses("font-semibold")}>
                      68%
                    </p>
                  </div>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>
                      Transit
                    </p>

                    <p className={themeClasses("font-semibold")}>
                      72%
                    </p>
                  </div>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>
                      Risk
                    </p>

                    <p className={themeClasses("font-semibold text-green-400")}>
                      Low
                    </p>
                  </div>

                </div>

              </button>


              {/* Strategy B */}
              <button
                onClick={() => setSelectedStrategy("B")}
                className={`text-left rounded-xl border p-5 transition ${
                  selectedStrategy === "B"
                    ? "border-blue-500 bg-blue-500/10"
                    : isDark
                    ? "border-slate-700 bg-slate-800 hover:border-slate-500"
                    : "border-slate-300 bg-white shadow-sm hover:border-slate-400"
                }`}
              >

                <div className={themeClasses("flex items-center justify-between")}>

                  <h3 className={themeClasses("text-lg font-semibold")}>
                    Strategy B
                  </h3>

                  <span className={themeClasses("text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400")}>
                    MEDIUM RISK
                  </span>

                </div>

                <p className={themeClasses("text-slate-300 mt-3")}>
                  Open additional North Gate access to distribute entry flow.
                </p>

                <div className={themeClasses("grid grid-cols-3 gap-3 mt-5")}>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>
                      Crowd
                    </p>

                    <p className={themeClasses("font-semibold")}>
                      73%
                    </p>
                  </div>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>
                      Transit
                    </p>

                    <p className={themeClasses("font-semibold")}>
                      61%
                    </p>
                  </div>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>
                      Risk
                    </p>

                    <p className={themeClasses("font-semibold text-yellow-400")}>
                      Medium
                    </p>
                  </div>

                </div>

              </button>

            </div>

            {/* Simulation Impact */}
<div className={themeClasses("mt-6 bg-slate-800/50 border border-slate-700 rounded-xl p-5")}>

  <div className={themeClasses("flex items-center justify-between mb-5")}>

    <div>
      <p className={themeClasses("text-blue-400 text-sm font-medium")}>
        SIMULATION IMPACT
      </p>

      <h3 className={themeClasses("text-lg font-semibold mt-1")}>
        Current vs Predicted Conditions
      </h3>
    </div>

    {!selectedStrategy && (
      <span className={themeClasses("text-xs text-slate-500")}>
        Select a strategy to preview
      </span>
    )}

  </div>


  {selectedStrategy ? (
    <div className={themeClasses("grid grid-cols-3 gap-4")}>

      {/* Crowd */}
      <div className={themeClasses("bg-slate-900 rounded-xl p-4")}>

        <p className={themeClasses("text-sm text-slate-400")}>
          Crowd Level
        </p>

        <div className={themeClasses("flex items-end gap-3 mt-3")}>

          <div>
            <p className={themeClasses("text-xs text-slate-500")}>
              Current
            </p>

            <p className={themeClasses("text-xl font-bold")}>
              {selectedStrategy === "A"
                 ? 68
                 : selectedStrategy === "B"
                 ? 73
                 : 78}%
           </p>
          </div>

          <span className={themeClasses("text-slate-500")}>
            →
          </span>

          <div>
            <p className={themeClasses("text-xs text-slate-500")}>
              Predicted
            </p>

            <p className={themeClasses("text-xl font-bold text-green-400")}>
              {selectedStrategy === "A" ? "68%" : "73%"}
            </p>
          </div>

        </div>

        <div className={themeClasses("mt-4 h-2 bg-slate-700 rounded-full overflow-hidden")}>
          <div
            className={themeClasses("h-2 bg-red-400 rounded-full")}
            style={{ width: "78%" }}
          />
        </div>

        <div className={themeClasses("mt-2 h-2 bg-slate-700 rounded-full overflow-hidden")}>
          <div
            className={themeClasses("h-2 bg-green-400 rounded-full")}
            style={{
              width: selectedStrategy === "A" ? "68%" : "73%",
            }}
          />
        </div>

      </div>


      {/* Network */}
      <div className={themeClasses("bg-slate-900 rounded-xl p-4")}>

        <p className={themeClasses("text-sm text-slate-400")}>
          Network Capacity
        </p>

        <div className={themeClasses("flex items-end gap-3 mt-3")}>

          <div>
            <p className={themeClasses("text-xs text-slate-500")}>
              Current
            </p>

            <p className={themeClasses("text-xl font-bold")}>
                {networkCapacity}%
            </p>
          </div>

          <span className={themeClasses("text-slate-500")}>
            →
          </span>

          <div>
            <p className={themeClasses("text-xs text-slate-500")}>
              Predicted
            </p>

            <p className={themeClasses("text-xl font-bold text-blue-400")}>
              {selectedStrategy === "A" ? "72%" : "61%"}
            </p>
          </div>

        </div>

        <div className={themeClasses("mt-4 h-2 bg-slate-700 rounded-full overflow-hidden")}>
          <div
            className={themeClasses("h-2 bg-slate-500 rounded-full")}
            style={{ width: "64%" }}
          />
        </div>

        <div className={themeClasses("mt-2 h-2 bg-slate-700 rounded-full overflow-hidden")}>
          <div
            className={themeClasses("h-2 bg-blue-400 rounded-full")}
            style={{
              width: selectedStrategy === "A" ? "72%" : "61%",
            }}
          />
        </div>

      </div>


      {/* Risk */}
      <div className={themeClasses("bg-slate-900 rounded-xl p-4")}>

        <p className={themeClasses("text-sm text-slate-400")}>
          Operational Risk
        </p>

        <div className={themeClasses("mt-4")}>

          <p className={themeClasses("text-xs text-slate-500")}>
            Current
          </p>

          <p className={themeClasses("text-xl font-bold text-yellow-400")}>
            Medium
          </p>

        </div>

        <div className={themeClasses("flex items-center gap-3 mt-3")}>

          <span className={themeClasses("text-slate-500")}>
            →
          </span>

          <div>

            <p className={themeClasses("text-xs text-slate-500")}>
              Predicted
            </p>

            <p
              className={`text-xl font-bold ${
                selectedStrategy === "A"
                  ? "text-green-400"
                  : "text-yellow-400"
              }`}
            >
              {selectedStrategy === "A" ? "Low" : "Medium"}
            </p>

          </div>

        </div>

      </div>

       {/* Crowd Redistribution */}
      <div className={themeClasses("col-span-3 mt-5 border-t border-slate-700 pt-5")}>

        <p className={themeClasses("text-blue-400 text-sm font-medium")}>
          CROWD REDISTRIBUTION
        </p>

        <h4 className={themeClasses("text-lg font-semibold mt-1")}>
          Predicted movement between zones
        </h4>

        {selectedStrategy === "A" ? (
          <div className={themeClasses("mt-5 grid grid-cols-1 md:grid-cols-3 items-center gap-4")}>

            {/* North Gate */}
            <div className={themeClasses("bg-red-500/10 border border-red-500/30 rounded-xl p-5")}>
              <p className={themeClasses("text-sm text-slate-400")}>
                North Gate
              </p>

              <p className={themeClasses("text-3xl font-bold text-red-400 mt-2")}>
                68%
              </p>

              <p className={themeClasses("text-xs text-green-400 mt-2")}>
                ↓ Crowd reduced
              </p>
            </div>

            {/* Movement */}
            <div className={themeClasses("text-center")}>
              <div className={themeClasses("text-3xl text-blue-400")}>
                →
              </div>

              <p className={themeClasses("text-xs text-slate-400 mt-2")}>
                Redirecting crowd
              </p>
            </div>

            {/* East Zone */}
            <div className={themeClasses("bg-green-500/10 border border-green-500/30 rounded-xl p-5")}>
              <p className={themeClasses("text-sm text-slate-400")}>
                East Zone
              </p>

              <p className={themeClasses("text-3xl font-bold text-green-400 mt-2")}>
                68%
              </p>

              <p className={themeClasses("text-xs text-green-400 mt-2")}>
                ↑ Crowd absorbed
              </p>
            </div>

          </div>
        ) : (
          <div className={themeClasses("mt-5 bg-slate-900 border border-slate-800 rounded-xl p-5")}>
            <p className={themeClasses("text-sm text-slate-400")}>
              Strategy B increases entry capacity at North Gate rather than
              redistributing the existing crowd.
            </p>
          </div>
        )}

      </div>


    </div>
  ) : (
    <div className={themeClasses("border border-dashed border-slate-700 rounded-xl p-8 text-center")}>

      <p className={themeClasses("text-slate-400")}>
        Select Strategy A or Strategy B above to simulate its impact.
      </p>

    </div>
  )}

</div>


            {/* Action */}
            <div className={themeClasses("flex items-center justify-between mt-7 pt-5 border-t border-slate-800")}>

              <p className={themeClasses("text-sm text-slate-400")}>
                {selectedStrategy
                  ? `Strategy ${selectedStrategy} selected for review`
                  : "Select a strategy to continue"}
              </p>

              <div className={themeClasses("flex gap-3")}>

                <button
                  onClick={() => {
                    setSandboxOpen(false)
                    setSelectedStrategy(null)
                  }}
                  className={themeClasses("px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800")}
                >
                  Cancel
                </button>

                <button
                  disabled={!selectedStrategy}
                  onClick={() => setReviewOpen(true)}
                  className={themeClasses("px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium")}
                >
                  Review Strategy
                </button>

              </div>

            </div>

          </div>

        </div>
      )}

      {sandboxOpen && (
        <div className={themeClasses("fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50")}>
          <div className={themeClasses("w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-7")}>
            <div className={themeClasses("flex items-center justify-between mb-6")}>
              <div>
                <p className={themeClasses("text-blue-400 text-sm font-medium")}>SANDBOX SIMULATION</p>
                <h2 className={themeClasses("text-2xl font-bold mt-1")}>Select a backend strategy set</h2>
                <p className={themeClasses("text-sm text-slate-400 mt-1")}>Current values are read from stored event state; simulation output is returned by P1 through P3.</p>
              </div>
              <button
                onClick={() => setSandboxOpen(false)}
                aria-label="Close sandbox"
                className={themeClasses("text-slate-400 hover:text-white text-2xl")}
              >×</button>
            </div>

            <div className={themeClasses("grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6")}>
              <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>
                <p className={themeClasses("text-sm text-slate-400")}>Crowd level</p>
                <p className={themeClasses("text-2xl font-bold mt-2")}>{formatPercent(dashboard?.stats.crowd_level_pct)}</p>
              </div>
              <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>
                <p className={themeClasses("text-sm text-slate-400")}>Live visitors</p>
                <p className={themeClasses("text-2xl font-bold mt-2")}>{dashboard?.stats.live_visitors.toLocaleString() ?? "No data"}</p>
              </div>
              <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>
                <p className={themeClasses("text-sm text-slate-400")}>Network capacity</p>
                <p className={themeClasses("text-2xl font-bold mt-2")}>{formatPercent(networkCapacity)}</p>
              </div>
            </div>

            <div className={themeClasses("grid grid-cols-1 lg:grid-cols-2 gap-4")}>
              {strategySets.map((strategySet) => (
                <button
                  key={strategySet.strategy_set_id}
                  onClick={() => {
                    setSelectedStrategy(String(strategySet.strategy_set_id))
                    setSimulationResult(null)
                  }}
                  className={`text-left rounded-xl border p-5 transition-colors duration-300 ${selectedStrategy === String(strategySet.strategy_set_id) ? "border-blue-500 bg-blue-500/10" : themeClasses("border-slate-700 bg-slate-800 hover:border-slate-500")}`}
                >
                  <div className={themeClasses("flex items-center justify-between gap-3")}>
                    <h3 className={themeClasses("text-lg font-semibold")}>{strategySet.name ?? `Strategy Set #${strategySet.strategy_set_id}`}</h3>
                    <span className={themeClasses("text-xs text-blue-400")}>{strategySet.status}</span>
                  </div>
                  <p className={themeClasses("text-sm text-slate-300 mt-3")}>
                    {strategySet.description ?? strategySet.strategies.map((strategy) => strategy.action).join("; ")}
                  </p>
                  <p className={themeClasses("text-xs text-slate-500 mt-3")}>
                    Risk: {strategySet.risk_level ?? "Not supplied"} · Attempts: {strategySet.attempt_count}
                  </p>
                </button>
              ))}
              {strategySets.length === 0 && (
                <p className={themeClasses("text-sm text-slate-500")}>No strategy sets have been supplied for this event.</p>
              )}
            </div>

            {simulationResult && (
              <div className={themeClasses("mt-6 bg-slate-800 rounded-xl p-5")}>
                <p className={themeClasses("text-xs text-blue-400 font-medium")}>BACKEND SIMULATION · {simulationResult.status}</p>
                <p className={themeClasses("mt-2")}>{simulationResult.result_summary}</p>
                {simulationResult.conflicts.length > 0 && (
                  <p className={themeClasses("text-sm text-yellow-400 mt-3")}>Conflicts: {simulationResult.conflicts.length}</p>
                )}
                {typeof simulationResult.predicted_metrics?.source === "string" && (
                  <p className={themeClasses("text-xs text-slate-500 mt-2")}>Metrics source: {String(simulationResult.predicted_metrics.source)}</p>
                )}
              </div>
            )}

            <div className={themeClasses("flex items-center justify-between gap-4 mt-7 pt-5 border-t border-slate-800")}>
              <p className={themeClasses("text-sm text-slate-400")}>
                {selectedStrategySet ? `${selectedStrategySet.name ?? `Strategy Set #${selectedStrategySet.strategy_set_id}`} selected` : "Select a strategy set to continue"}
              </p>
              <div className={themeClasses("flex gap-3")}>
                <button onClick={() => setSandboxOpen(false)} className={themeClasses("px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800")}>Cancel</button>
                <button
                  disabled={!selectedStrategySet || actionSaving}
                  onClick={() => void handleReviewStrategy()}
                  className={themeClasses("px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium")}
                >
                  {actionSaving ? "Simulating..." : "Simulate and Review"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ==================== STRATEGY REVIEW MODAL ==================== */}
      {reviewOpen && selectedStrategy && (
        <div className={themeClasses("fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-[60]")}>

          <div className={themeClasses("w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-7 shadow-2xl")}>

            <p className={themeClasses("text-blue-400 text-sm font-medium")}>
              STRATEGY REVIEW
            </p>

            <h2 className={themeClasses("text-2xl font-bold mt-1")}>
              {selectedStrategySet?.name ?? `Strategy Set #${selectedStrategy}`}
            </h2>

            <p className={themeClasses("text-slate-400 mt-2")}>
              Review the simulation result returned by the backend before approving.
            </p>


            <div className={themeClasses("mt-7 bg-slate-800 rounded-xl p-5")}>
              <p className={themeClasses("text-xs text-blue-400 font-medium")}>
                {simulationResult?.status ?? "NO RESULT"}
              </p>
              <p className={themeClasses("mt-2")}>
                {simulationResult?.result_summary ?? "No simulation result has been returned."}
              </p>
              <p className={themeClasses("text-sm text-slate-400 mt-3")}>
                {simulationResult?.conflicts.length ?? 0} reported conflicts
              </p>
            </div>


            {/* Simulation Notice */}
            <div className={themeClasses("mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4")}>

              <p className={themeClasses("text-sm text-blue-300")}>
                Approval records the coordinator decision and triggers the backend execution workflow.
              </p>

            </div>


            {/* Buttons */}
            <div className={themeClasses("flex justify-end gap-3 mt-7")}>

              <button
                onClick={() => {
                  setReviewOpen(false)
                  setSimulationResult(null)
                }}
                className={themeClasses("px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800")}
              >
                Back
              </button>

              <button
                onClick={() => void handleApproveStrategy()}
                disabled={actionSaving || !simulationResult}
                className={themeClasses("px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 font-medium")}
              >
                {actionSaving ? "Approving..." : "Approve Strategy"}
              </button>

            </div>

          </div>

        </div>
      )}


      {/* ==================== APPROVED NOTIFICATION ==================== */}
      {strategyApproved && (
        <div className={themeClasses("fixed bottom-6 right-6 z-[70] bg-green-500/10 border border-green-500/30 rounded-xl p-5 shadow-xl")}>

          <p className={themeClasses("text-green-400 font-semibold")}>
            Strategy approved
          </p>

          <p className={themeClasses("text-sm text-slate-300 mt-1")}>
            {selectedStrategySet?.name ?? `Strategy Set #${selectedStrategy}`} has been approved.
          </p>

          <button
            onClick={() => setStrategyApproved(false)}
            className={themeClasses("text-xs text-slate-400 hover:text-white mt-3")}
          >
            Dismiss
          </button>

        </div>
      )}

       
     </main>
    </div>
  )
}

export default App