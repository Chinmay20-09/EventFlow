import { useEffect, useState } from "react"

const stats = [
  {
    label: "Crowd Level",
    value: "78%",
    status: "High",
    icon: "👥",
  },
  {
    label: "Active Alerts",
    value: "03",
    status: "Attention",
    icon: "⚠️",
  },
  {
    label: "Network Capacity",
    value: "64%",
    status: "Stable",
    icon: "🚌",
  },
  {
    label: "Risk Level",
    value: "Medium",
    status: "Monitoring",
    icon: "🛡️",
  },
]




function App() {
  const [activePage, setActivePage] = useState("Overview")
  const [sandboxOpen, setSandboxOpen] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [strategyApproved, setStrategyApproved] = useState(false)
  const [executionStatus, setExecutionStatus] = useState("Ready")
  const [executionProgress, setExecutionProgress] = useState(0)
  const [liveVisitors, setLiveVisitors] = useState(18452)
  const [eventName, setEventName] = useState("Mumbai Music Festival")
  const [maxCapacity, setMaxCapacity] = useState(50000)
  const [alertThreshold, setAlertThreshold] = useState(85)
  const [autoAlerts, setAutoAlerts] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

 const northGateCrowd =
  selectedStrategy === "A"
    ? 68
    : selectedStrategy === "B"
    ? 73
    : 92

const eastZoneCrowd =
  selectedStrategy === "A"
    ? 68
    : 54
   
const transitCapacity =
  selectedStrategy === "A"
    ? 72
    : selectedStrategy === "B"
    ? 61
    : 64    
  
const networkCapacity = transitCapacity

  const [activityLog, setActivityLog] = useState([
    {
      time: "2 min ago",
      message: "Crowd buildup detected at North Gate",
      type: "alert",
    },
    {
      time: "5 min ago",
      message: "Transit capacity decreased to 64%",
      type: "warning",
    },
    {
      time: "8 min ago",
      message: "Weather disruption detected in East Zone",
      type: "warning",
    },
  ])

  useEffect(() => {
  if (executionStatus !== "Executing") {
    return
  }

  const interval = setInterval(() => {
    setExecutionProgress((current) => {
      const nextProgress = Math.min(current + 10, 100)

      if (nextProgress === 100) {
        setExecutionStatus("Completed")

        setActivityLog((currentLog) => [
          {
            time: "Just now",
            message: `Strategy ${selectedStrategy} execution completed`,
            type: "success",
          },
          ...currentLog,
        ])
      }

      return nextProgress
    })
  }, 1000)

  return () => clearInterval(interval)
}, [executionStatus, selectedStrategy])

useEffect(() => {
  const interval = setInterval(() => {
    setLiveVisitors((current) => {
      const change = Math.floor(Math.random() * 9) - 4
      return Math.max(18000, current + change)
    })
  }, 2000)

  return () => clearInterval(interval)
}, [])
  
  const alerts =
  selectedStrategy === "A"
    ? [
        {
          title: "Crowd successfully redirected",
          location: "North Gate",
          level: "LOW",
          time: "Live",
        },
        {
          title: "Transit operating efficiently",
          location: "Central Station",
          level: "LOW",
          time: "Live",
        },
      ]
    : selectedStrategy === "B"
    ? [
        {
          title: "Additional gate opened",
          location: "North Gate",
          level: "MEDIUM",
          time: "Live",
        },
        {
          title: "Entry flow stabilizing",
          location: "Central Station",
          level: "LOW",
          time: "Live",
        },
      ]
    : [
        {
          title: "Crowd buildup detected",
          location: "North Gate",
          level: "HIGH",
          time: "2 min ago",
        },
        {
          title: "Transit capacity decreasing",
          location: "Central Station",
          level: "MEDIUM",
          time: "5 min ago",
        },
        {
          title: "Weather disruption possible",
          location: "East Zone",
          level: "MEDIUM",
          time: "8 min ago",
        },
      ]
  useEffect(() => {
  const timer = setInterval(() => {
    setCurrentTime(new Date())
  }, 1000)

  return () => clearInterval(timer)
}, [])    

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">

      {/* ==================== SIDEBAR ==================== */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900 p-5">

        <div className="mb-8">
          <h1 className="text-2xl font-bold">EventFlow</h1>
          <p className="text-sm text-slate-400 mt-1">
            Command Center
          </p>
        </div>

        <nav className="space-y-2">
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
              className={`w-full text-left px-4 py-3 rounded-lg transition ${
                activePage === item
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="mt-10 border-t border-slate-800 pt-5">
          <p className="text-xs text-slate-500 uppercase">
            System
          </p>

          <div className="flex items-center gap-2 mt-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="text-sm text-slate-300">
              All systems operational
            </span>
          </div>
        </div>

      </aside>


      {/* ==================== MAIN CONTENT ==================== */}
      <main className="flex-1 p-8">

        {/* Header */}
        <header className="flex items-center justify-between mb-8">

          <div>
            <p className="text-sm text-blue-400 font-medium">
              LIVE EVENT
            </p>

            <h2 className="text-3xl font-bold mt-1">
                {eventName}
            </h2>

            <p className="text-slate-400 mt-1">
              Organizer Command Center · Monitoring live conditions
            </p>
          </div>

          <div className="flex items-center gap-4">

  <div className="text-right">
    <p className="text-xs text-slate-400">LOCAL TIME</p>
    <p className="font-semibold">
      {currentTime.toLocaleTimeString()}
    </p>
  </div>

  <div className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900">
    <span className="text-sm text-slate-400">Status</span>
    <span className="ml-2 text-green-400 font-medium">LIVE</span>
  </div>

  <button
    onClick={() => setSandboxOpen(true)}
    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium"
  >
    Open Sandbox
  </button>

  <div className="relative">
    <button className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xl">
      🔔
    </button>

    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
      {alerts.length}
    </span>
  </div>

  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">
    O
  </div>

</div>
          
        </header>


        {/* ==================== STATS ==================== */}
        <section className="grid grid-cols-4 gap-4 mb-6">

          {/* Crowd Level */}
<div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
  <div className="flex items-center justify-between">
    <span className="text-2xl">👥</span>
    <span className="text-xs text-red-400">High</span>
  </div>

  <p className="text-slate-400 text-sm mt-5">Crowd Level</p>

  <p className="text-3xl font-bold mt-1">
    {selectedStrategy === "A"
      ? "68%"
      : selectedStrategy === "B"
      ? "73%"
      : "78%"}
  </p>
</div>

{/* Live Visitors */}
<div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
  <div className="flex items-center justify-between">
    <span className="text-2xl">🎟️</span>
    <span className="text-xs text-green-400">LIVE</span>
  </div>

  <p className="text-slate-400 text-sm mt-5">Live Visitors</p>

  <p className="text-3xl font-bold mt-1">
    {liveVisitors.toLocaleString()}
  </p>

  <p className="text-green-400 text-xs mt-2">
    Updating every 2 sec
  </p>
</div>

{/* Network Capacity */}
<div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
  <div className="flex items-center justify-between">
    <span className="text-2xl">🚌</span>
    <span className="text-xs text-blue-400">Stable</span>
  </div>

  <p className="text-slate-400 text-sm mt-5">Network Capacity</p>

  <p className="text-3xl font-bold mt-1">
    {networkCapacity}%
  </p>
</div>

{/* Risk Level */}
<div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
  <div className="flex items-center justify-between">
    <span className="text-2xl">🛡️</span>
    <span className="text-xs text-yellow-400">Monitoring</span>
  </div>

  <p className="text-slate-400 text-sm mt-5">Risk Level</p>

  <p className="text-3xl font-bold mt-1">
    {selectedStrategy === "A" ? "Low" : "Medium"}
  </p>
</div>

        </section>


        {/* ==================== OVERVIEW ==================== */}
        {activePage === "Overview" && (
          <>
            <section className="grid grid-cols-3 gap-6">

              {/* Live Crowd Map */}
              <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">

                <div className="flex items-center justify-between mb-4">

                  <div>
                    <h3 className="text-lg font-semibold">
                      Live Crowd Map
                    </h3>

                    <p className="text-sm text-slate-400">
                      Current crowd distribution across event zones
                    </p>
                    {selectedStrategy && (
                      <span className="inline-block mt-2 text-xs text-blue-300">
                       Simulation active: Strategy {selectedStrategy}
                      </span>
                    )}
                  </div>

                  <span className="text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400">
                    {selectedStrategy ? "SIMULATION" : "LIVE DATA"}
                  </span>

                </div>

                <div className="h-96 rounded-lg bg-slate-800 relative overflow-hidden">

                  <div className="absolute inset-0 opacity-30">
                    <div className="h-full w-full bg-[linear-gradient(to_right,#64748b_1px,transparent_1px),linear-gradient(to_bottom,#64748b_1px,transparent_1px)] bg-[size:40px_40px]" />
                  </div>

                 <div className="absolute top-16 left-20 w-32 h-24 rounded-full bg-red-500/30 border border-red-400 flex items-center justify-center">
  <div className="flex flex-col items-center">
    <span className="text-sm font-medium">
  North Gate
</span>

<span className="text-xs mt-1 font-bold">
  {northGateCrowd}%
</span>

{selectedStrategy === "B" && (
  <span className="text-[10px] mt-1 text-green-300">
    Additional gate open
  </span>
)}
  </div>
</div>

                  <div className="absolute top-40 right-24 w-36 h-28 rounded-full bg-yellow-500/30 border border-yellow-400 flex items-center justify-center">
                    <span className="text-sm font-medium">
                      Central Zone
                    </span>
                  </div>

                 <div className="absolute bottom-12 left-32 w-32 h-24 rounded-full bg-green-500/30 border border-green-400 flex items-center justify-center">
  <div className="flex flex-col items-center">
    <span className="text-sm font-medium">
      East Zone
    </span>

    <span className="text-xs mt-1 font-bold">
      {eastZoneCrowd}%
    </span>
  </div>
</div>

                  <div className="absolute bottom-16 right-32 w-28 h-20 rounded-full bg-blue-500/30 border border-blue-400 flex items-center justify-center">
  <div className="flex flex-col items-center">
    <span className="text-sm font-medium">
      Transit
    </span>
    <span className="text-xs mt-1 font-bold">
      {transitCapacity}%
    </span>
  </div>
</div>

                </div>
              </div>


              {/* Predictive Alerts */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">

                <h3 className="text-lg font-semibold">
                  Predictive Alerts
                </h3>

                <p className="text-sm text-slate-400 mt-1 mb-5">
                  Issues requiring attention
                </p>

                <div className="space-y-4">

                  {alerts.map((alert) => (
                    <div
                      key={alert.title}
                      className="border border-slate-800 rounded-lg p-4"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div>

                          <p className="font-medium">
                            {alert.title}
                          </p>

                          <p className="text-sm text-slate-400 mt-1">
                            {alert.location}
                          </p>

                          <p className="text-xs text-slate-500 mt-2">
                            {alert.time}
                          </p>

                        </div>

                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            alert.level === "HIGH"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-yellow-500/10 text-yellow-400"
                          }`}
                        >
                          {alert.level}
                        </span>

                      </div>

                    </div>
                  ))}

                </div>
              </div>

            </section>


            {/* ==================== EXECUTION STATUS ==================== */}
            <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-blue-400 text-sm font-medium">
                    EXECUTION STATUS
                  </p>

                  <h3 className="text-xl font-semibold mt-1">
                    {executionStatus === "Executing"
                      ? `Strategy ${selectedStrategy} is being executed`
                      : executionStatus === "Completed"
                      ? `Strategy ${selectedStrategy} execution completed`
                      : "No active strategy"}
                  </h3>

                  <p className="text-sm text-slate-400 mt-2">
                    {executionStatus === "Executing"
                      ? "Operational changes are being monitored in real time."
                      : "Simulate and approve a strategy to begin execution."}
                  </p>

                </div>

                <div className="flex items-center gap-3">

                  <div
                    className={`w-3 h-3 rounded-full ${
                      executionStatus === "Executing"
                        ? "bg-blue-400 animate-pulse"
                        : "bg-slate-600"
                    }`}
                  />

                  <span className="font-medium">
                    {executionStatus}
                  </span>

                </div>

              </div>


              {(executionStatus === "Executing" ||
                executionStatus === "Completed") && (
                <div className="mt-5">

                  <div className="flex justify-between text-sm mb-2">

                    <span className="text-slate-400">
                      Execution progress
                    </span>

                    <span>
                      {executionProgress}%
                    </span>

                  </div>

                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                     className="h-2 bg-blue-500 rounded-full transition-all duration-700"
                     style={{ width: `${executionProgress}%` }}
                    />
                  </div>

                </div>
              )}

            </div>

            {/* Activity Timeline */}
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6">

          <div className="flex items-center justify-between mb-5">

            <div>
              <p className="text-blue-400 text-sm font-medium">
                ACTIVITY
              </p>

              <h3 className="text-xl font-semibold mt-1">
                Event Timeline
              </h3>
            </div>

            <span className="text-xs text-slate-500">
              LIVE
            </span>

          </div>

          <div className="space-y-4">

            {activityLog.map((activity, index) => (
              <div
                key={`${activity.time}-${index}`}
                className="flex items-start gap-4"
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

                <div className="flex-1">

                  <p className="text-sm text-slate-200">
                    {activity.message}
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    {activity.time}
                  </p>

                </div>

              </div>
            ))}

          </div>

        </div>

          </>
        )}


        {/* ==================== CROWD MONITOR ==================== */}
        {activePage === "Crowd Monitor" && (
          <section className="space-y-6">

            <div>
              <h3 className="text-2xl font-bold">
                Crowd Monitor
              </h3>

              <p className="text-slate-400 mt-1">
                Monitor crowd density across every event zone.
              </p>
            </div>


            <div className="grid grid-cols-4 gap-4">

              {[
                ["North Gate", "92%", "HIGH"],
                ["Central Zone", "78%", "HIGH"],
                ["East Zone", "54%", "NORMAL"],
                ["Transit", "64%", "STABLE"],
              ].map(([zone, level, status]) => (
                <div
                  key={zone}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5"
                >

                  <p className="text-slate-400 text-sm">
                    {zone}
                  </p>

                  <p className="text-3xl font-bold mt-2">
                    {level}
                  </p>

                  <span
                    className={`inline-block mt-3 text-xs px-2 py-1 rounded ${
                      status === "HIGH"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-green-500/10 text-green-400"
                    }`}
                  >
                    {status}
                  </span>

                </div>
              ))}

            </div>


            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">

              <h3 className="text-lg font-semibold">
                Crowd Movement
              </h3>

              <p className="text-sm text-slate-400 mt-1">
                Current movement between zones
              </p>


              <div className="mt-6 space-y-5">

                <div>

                  <div className="flex justify-between text-sm mb-2">
                    <span>
                      North Gate → Central Zone
                    </span>

                    <span className="text-red-400">
                      High flow
                    </span>
                  </div>

                  <div className="h-3 bg-slate-800 rounded-full">
                    <div className="h-3 w-[85%] bg-red-500 rounded-full" />
                  </div>

                </div>


                <div>

                  <div className="flex justify-between text-sm mb-2">
                    <span>
                      Central Zone → East Zone
                    </span>

                    <span className="text-yellow-400">
                      Moderate
                    </span>
                  </div>

                  <div className="h-3 bg-slate-800 rounded-full">
                    <div className="h-3 w-[55%] bg-yellow-500 rounded-full" />
                  </div>

                </div>


                <div>

                  <div className="flex justify-between text-sm mb-2">
                    <span>
                      East Zone → Transit
                    </span>

                    <span className="text-green-400">
                      Normal
                    </span>
                  </div>

                  <div className="h-3 bg-slate-800 rounded-full">
                    <div className="h-3 w-[35%] bg-green-500 rounded-full" />
                  </div>

                </div>

              </div>
            </div>

          </section>
        )}


        {/* ==================== PREDICTIONS ==================== */}
        {activePage === "Predictions" && (
  <div className="space-y-6">

    <div>
      <p className="text-blue-400 text-sm font-medium">
        AI CROWD FORECAST
      </p>
      <h2 className="text-3xl font-bold mt-1">
        Next 60 Minutes Prediction
      </h2>
      <p className="text-slate-400 mt-2">
        Forecasted congestion generated from the EventFlow simulation engine.
      </p>
    </div>

    {/* Forecast Cards */}
    <div className="grid grid-cols-4 gap-4">

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <p className="text-slate-400 text-sm">North Gate</p>
        <p className="text-3xl font-bold text-red-400 mt-2">89%</p>
        <p className="text-xs text-red-300 mt-2">+12% expected</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <p className="text-slate-400 text-sm">Central Zone</p>
        <p className="text-3xl font-bold text-yellow-400 mt-2">74%</p>
        <p className="text-xs text-yellow-300 mt-2">Moderate density</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <p className="text-slate-400 text-sm">East Zone</p>
        <p className="text-3xl font-bold text-green-400 mt-2">58%</p>
        <p className="text-xs text-green-300 mt-2">Stable flow</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <p className="text-slate-400 text-sm">Transit</p>
        <p className="text-3xl font-bold text-blue-400 mt-2">71%</p>
        <p className="text-xs text-blue-300 mt-2">Normal operation</p>
      </div>

    </div>

    {/* Forecast Timeline */}
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-xl font-semibold mb-5">
        Predicted Crowd Growth
      </h3>

      <svg viewBox="0 0 600 220" className="w-full h-auto">

        <line x1="50" y1="20" x2="50" y2="180" stroke="#475569" strokeWidth="1"/>

        <line x1="50" y1="180" x2="560" y2="180" stroke="#475569" strokeWidth="1"/>

        <polyline
          fill="none"
          stroke="#ef4444"
          strokeWidth="4"
          points="50,140 140,120 230,90 320,60 410,45 500,35"
        />

        <g fill="#ef4444">
          <circle cx="50" cy="140" r="4"/>
          <circle cx="140" cy="120" r="4"/>
          <circle cx="230" cy="90" r="4"/>
          <circle cx="320" cy="60" r="4"/>
          <circle cx="410" cy="45" r="4"/>
          <circle cx="500" cy="35" r="4"/>
        </g>

        <g fill="#94a3b8" fontSize="11" textAnchor="middle">
          <text x="50" y="198">Now</text>
          <text x="140" y="198">10m</text>
          <text x="230" y="198">20m</text>
          <text x="320" y="198">30m</text>
          <text x="410" y="198">45m</text>
          <text x="500" y="198">60m</text>
        </g>

        <g fill="#64748b" fontSize="10" textAnchor="end">
          <text x="42" y="180">40%</text>
          <text x="42" y="140">55%</text>
          <text x="42" y="100">70%</text>
          <text x="42" y="60">85%</text>
          <text x="42" y="25">100%</text>
        </g>

      </svg>

      <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
        <div className="w-4 h-1 bg-red-500 rounded"/>
        North Gate forecast
      </div>
    </div>

    {/* AI Recommendation */}
    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
      <p className="text-blue-300 text-sm font-medium">
        AI RECOMMENDATION
      </p>

     <h3 className="text-xl font-semibold mt-2">
  {selectedStrategy === "A"
    ? "Strategy A successfully reduces congestion"
    : selectedStrategy === "B"
    ? "Additional gate stabilizes entry flow"
    : "Open an additional North Gate within 20 minutes"}
</h3>
      <button
  onClick={() => setSandboxOpen(true)}
  className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium"
>
  Test Response in Sandbox
</button>

      <p className="text-slate-300 mt-3">
        Forecast indicates congestion may exceed 85% between 30–60 minutes.
        Early intervention is expected to reduce peak crowd density.
      </p>
    </div>

  </div>
)}


        {/* ==================== STRATEGIES ==================== */}
        {activePage === "Strategies" && (
          <section className="space-y-6">

            <div>

              <h3 className="text-2xl font-bold">
                Strategies
              </h3>

              <p className="text-slate-400 mt-1">
                Available operational responses.
              </p>

            </div>


            <div className="grid grid-cols-2 gap-5">

              {/* Strategy A */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">

                <div className="flex justify-between">

                  <h3 className="text-lg font-semibold">
                    Redirect Crowd
                  </h3>

                  <span className="text-xs text-green-400">
                    LOW RISK
                  </span>

                </div>

                <p className="text-slate-400 text-sm mt-3">
                  Redirect incoming crowd from North Gate toward East Zone.
                </p>

                <button
                  onClick={() => setSandboxOpen(true)}
                  className="mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium"
                >
                  Test Strategy
                </button>

              </div>


              {/* Strategy B */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">

                <div className="flex justify-between">

                  <h3 className="text-lg font-semibold">
                    Open Additional Gate
                  </h3>

                  <span className="text-xs text-yellow-400">
                    MEDIUM RISK
                  </span>

                </div>

                <p className="text-slate-400 text-sm mt-3">
                  Increase entry capacity by opening an additional access point.
                </p>

                <button
                  onClick={() => setSandboxOpen(true)}
                  className="mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium"
                >
                  Test Strategy
                </button>

              </div>

            </div>

          </section>
        )}
        {activePage === "Settings" && (
  <section className="space-y-6">
    <div>
      <p className="text-blue-400 text-sm font-medium">
        ORGANIZER SETTINGS
      </p>

      <h2 className="text-3xl font-bold mt-1">
        System Configuration
      </h2>

      <p className="text-slate-400 mt-2">
        Configure event parameters and alert behavior.
      </p>
    </div>

    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">

      <div>
        <label className="block text-sm text-slate-400 mb-2">
          Event Name
        </label>

        <input
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">
          Maximum Capacity
        </label>

        <input
          type="number"
          value={maxCapacity}
          onChange={(e) => setMaxCapacity(Number(e.target.value))}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">
          Alert Threshold ({alertThreshold}%)
        </label>

        <input
          type="range"
          min="60"
          max="100"
          value={alertThreshold}
          onChange={(e) => setAlertThreshold(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="flex items-center justify-between bg-slate-800 rounded-lg p-4">
        <div>
          <p className="font-medium">
            Auto AI Alerts
          </p>

          <p className="text-sm text-slate-400">
            Automatically generate predictive warnings
          </p>
        </div>

        <button
          onClick={() => setAutoAlerts(!autoAlerts)}
          className={`w-14 h-8 rounded-full transition ${
            autoAlerts ? "bg-blue-600" : "bg-slate-600"
          }`}
        >
          <div
            className={`w-6 h-6 bg-white rounded-full transition transform ${
              autoAlerts ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <button className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium">
        Save Settings
      </button>

    </div>
  </section>
)}


{/* ==================== SANDBOX SECTION ==================== */}
{activePage === "Overview" && (
  <section className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6">

    <div className="flex items-center justify-between">
      <div>
        <p className="text-blue-400 text-sm font-medium">SANDBOX</p>
        <h3 className="text-xl font-semibold mt-1">
          Test a response before taking action
        </h3>
        <p className="text-sm text-slate-400 mt-2">
          Compare AI-generated strategies against current event conditions.
        </p>
      </div>

      <button
        onClick={() => setSandboxOpen(true)}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium"
      >
        Open Sandbox
      </button>
    </div>

    <div className="mt-6 grid grid-cols-4 gap-4">

      <div className="bg-slate-800 rounded-lg p-4">
        <p className="text-xs text-slate-400">Crowd Level</p>
        <p className="text-2xl font-bold mt-2">
          {selectedStrategy === "A"
            ? "68%"
            : selectedStrategy === "B"
            ? "73%"
            : "78%"}
        </p>
      </div>

      <div className="bg-slate-800 rounded-lg p-4">
        <p className="text-xs text-slate-400">North Gate</p>
        <p className="text-2xl font-bold mt-2 text-red-400">
          {selectedStrategy === "A" ? "Reduced" : "High"}
        </p>
      </div>

      <div className="bg-slate-800 rounded-lg p-4">
        <p className="text-xs text-slate-400">Network Capacity</p>
        <p className="text-2xl font-bold mt-2">
          {selectedStrategy === "A"
            ? "72%"
            : selectedStrategy === "B"
            ? "61%"
            : "64%"}
        </p>
      </div>

      <div className="bg-slate-800 rounded-lg p-4">
        <p className="text-xs text-slate-400">Risk</p>
        <p className="text-2xl font-bold mt-2 text-yellow-400">
          {selectedStrategy === "A" ? "Low" : "Medium"}
        </p>
      </div>

    </div>
  </section>
)}


      {/* ==================== SANDBOX MODAL ==================== */}
      {sandboxOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">

          <div className="w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-7">

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-7">

              <div>

                <p className="text-blue-400 text-sm font-medium">
                  SANDBOX SIMULATION
                </p>

                <h2 className="text-2xl font-bold mt-1">
                  Test a response before taking action
                </h2>

                <p className="text-slate-400 text-sm mt-1">
                  Compare possible strategies against the current event conditions.
                </p>

              </div>

              <button
                onClick={() => {
                  setSandboxOpen(false)
                  setSelectedStrategy(null)
                }}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>

            </div>


            {/* Current Situation */}
            <div className="bg-slate-800/60 rounded-xl p-5 mb-6">

              <h3 className="font-semibold mb-4">
                Current Situation
              </h3>

              <div className="grid grid-cols-3 gap-4">

                <div>

                  <p className="text-sm text-slate-400">
                    Crowd Level
                  </p>

                  <p className="text-2xl font-bold mt-1">
                    {selectedStrategy === "A"
                      ? "68%"
                      : selectedStrategy === "B"
                      ? "73%"
                      : "78%"}
                  </p>

                </div>


                <div>

                  <p className="text-sm text-slate-400">
                    North Gate
                  </p>

                  <p className="text-2xl font-bold text-red-400 mt-1">
                    High
                  </p>

                </div>


                <div>

                  <p className="text-sm text-slate-400">
                    Network Capacity
                  </p>

                  <p className="text-2xl font-bold mt-1">
                    {networkCapacity}%
                  </p>
                </div>

              </div>

            </div>


            {/* Strategies */}
            <div className="grid grid-cols-2 gap-5">

              {/* Strategy A */}
              <button
                onClick={() => setSelectedStrategy("A")}
                className={`text-left rounded-xl border p-5 transition ${
                  selectedStrategy === "A"
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-700 bg-slate-800 hover:border-slate-500"
                }`}
              >

                <div className="flex items-center justify-between">

                  <h3 className="text-lg font-semibold">
                    Strategy A
                  </h3>

                  <span className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400">
                    LOW RISK
                  </span>

                </div>

                <p className="text-slate-300 mt-3">
                  Redirect crowd from North Gate toward East Zone.
                </p>

                <div className="grid grid-cols-3 gap-3 mt-5">

                  <div>
                    <p className="text-xs text-slate-500">
                      Crowd
                    </p>

                    <p className="font-semibold">
                      68%
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Transit
                    </p>

                    <p className="font-semibold">
                      72%
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Risk
                    </p>

                    <p className="font-semibold text-green-400">
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
                    : "border-slate-700 bg-slate-800 hover:border-slate-500"
                }`}
              >

                <div className="flex items-center justify-between">

                  <h3 className="text-lg font-semibold">
                    Strategy B
                  </h3>

                  <span className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400">
                    MEDIUM RISK
                  </span>

                </div>

                <p className="text-slate-300 mt-3">
                  Open additional North Gate access to distribute entry flow.
                </p>

                <div className="grid grid-cols-3 gap-3 mt-5">

                  <div>
                    <p className="text-xs text-slate-500">
                      Crowd
                    </p>

                    <p className="font-semibold">
                      73%
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Transit
                    </p>

                    <p className="font-semibold">
                      61%
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Risk
                    </p>

                    <p className="font-semibold text-yellow-400">
                      Medium
                    </p>
                  </div>

                </div>

              </button>

            </div>

            {/* Simulation Impact */}
<div className="mt-6 bg-slate-800/50 border border-slate-700 rounded-xl p-5">

  <div className="flex items-center justify-between mb-5">

    <div>
      <p className="text-blue-400 text-sm font-medium">
        SIMULATION IMPACT
      </p>

      <h3 className="text-lg font-semibold mt-1">
        Current vs Predicted Conditions
      </h3>
    </div>

    {!selectedStrategy && (
      <span className="text-xs text-slate-500">
        Select a strategy to preview
      </span>
    )}

  </div>


  {selectedStrategy ? (
    <div className="grid grid-cols-3 gap-4">

      {/* Crowd */}
      <div className="bg-slate-900 rounded-xl p-4">

        <p className="text-sm text-slate-400">
          Crowd Level
        </p>

        <div className="flex items-end gap-3 mt-3">

          <div>
            <p className="text-xs text-slate-500">
              Current
            </p>

            <p className="text-xl font-bold">
              {selectedStrategy === "A"
                 ? 68
                 : selectedStrategy === "B"
                 ? 73
                 : 78}%
           </p>
          </div>

          <span className="text-slate-500">
            →
          </span>

          <div>
            <p className="text-xs text-slate-500">
              Predicted
            </p>

            <p className="text-xl font-bold text-green-400">
              {selectedStrategy === "A" ? "68%" : "73%"}
            </p>
          </div>

        </div>

        <div className="mt-4 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-2 bg-red-400 rounded-full"
            style={{ width: "78%" }}
          />
        </div>

        <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-2 bg-green-400 rounded-full"
            style={{
              width: selectedStrategy === "A" ? "68%" : "73%",
            }}
          />
        </div>

      </div>


      {/* Network */}
      <div className="bg-slate-900 rounded-xl p-4">

        <p className="text-sm text-slate-400">
          Network Capacity
        </p>

        <div className="flex items-end gap-3 mt-3">

          <div>
            <p className="text-xs text-slate-500">
              Current
            </p>

            <p className="text-xl font-bold">
                {networkCapacity}%
            </p>
          </div>

          <span className="text-slate-500">
            →
          </span>

          <div>
            <p className="text-xs text-slate-500">
              Predicted
            </p>

            <p className="text-xl font-bold text-blue-400">
              {selectedStrategy === "A" ? "72%" : "61%"}
            </p>
          </div>

        </div>

        <div className="mt-4 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-2 bg-slate-500 rounded-full"
            style={{ width: "64%" }}
          />
        </div>

        <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-2 bg-blue-400 rounded-full"
            style={{
              width: selectedStrategy === "A" ? "72%" : "61%",
            }}
          />
        </div>

      </div>


      {/* Risk */}
      <div className="bg-slate-900 rounded-xl p-4">

        <p className="text-sm text-slate-400">
          Operational Risk
        </p>

        <div className="mt-4">

          <p className="text-xs text-slate-500">
            Current
          </p>

          <p className="text-xl font-bold text-yellow-400">
            Medium
          </p>

        </div>

        <div className="flex items-center gap-3 mt-3">

          <span className="text-slate-500">
            →
          </span>

          <div>

            <p className="text-xs text-slate-500">
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
      <div className="mt-5 border-t border-slate-700 pt-5">

        <p className="text-blue-400 text-sm font-medium">
          CROWD REDISTRIBUTION
        </p>

        <h4 className="text-lg font-semibold mt-1">
          Predicted movement between zones
        </h4>

        {selectedStrategy === "A" ? (
          <div className="mt-5 grid grid-cols-3 items-center gap-4">

            {/* North Gate */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <p className="text-sm text-slate-400">
                North Gate
              </p>

              <p className="text-3xl font-bold text-red-400 mt-2">
                68%
              </p>

              <p className="text-xs text-green-400 mt-2">
                ↓ Crowd reduced
              </p>
            </div>

            {/* Movement */}
            <div className="text-center">
              <div className="text-3xl text-blue-400">
                →
              </div>

              <p className="text-xs text-slate-400 mt-2">
                Redirecting crowd
              </p>
            </div>

            {/* East Zone */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5">
              <p className="text-sm text-slate-400">
                East Zone
              </p>

              <p className="text-3xl font-bold text-green-400 mt-2">
                68%
              </p>

              <p className="text-xs text-green-400 mt-2">
                ↑ Crowd absorbed
              </p>
            </div>

          </div>
        ) : (
          <div className="mt-5 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-sm text-slate-400">
              Strategy B increases entry capacity at North Gate rather than
              redistributing the existing crowd.
            </p>
          </div>
        )}

      </div>


    </div>
  ) : (
    <div className="border border-dashed border-slate-700 rounded-xl p-8 text-center">

      <p className="text-slate-400">
        Select Strategy A or Strategy B above to simulate its impact.
      </p>

    </div>
  )}

</div>


            {/* Action */}
            <div className="flex items-center justify-between mt-7 pt-5 border-t border-slate-800">

              <p className="text-sm text-slate-400">
                {selectedStrategy
                  ? `Strategy ${selectedStrategy} selected for review`
                  : "Select a strategy to continue"}
              </p>

              <div className="flex gap-3">

                <button
                  onClick={() => {
                    setSandboxOpen(false)
                    setSelectedStrategy(null)
                  }}
                  className="px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800"
                >
                  Cancel
                </button>

                <button
                  disabled={!selectedStrategy}
                  onClick={() => setReviewOpen(true)}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  Review Strategy
                </button>

              </div>

            </div>

          </div>

        </div>
      )}


      {/* ==================== STRATEGY REVIEW MODAL ==================== */}
      {reviewOpen && selectedStrategy && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-[60]">

          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-7 shadow-2xl">

            <p className="text-blue-400 text-sm font-medium">
              STRATEGY REVIEW
            </p>

            <h2 className="text-2xl font-bold mt-1">
              Strategy {selectedStrategy}
            </h2>

            <p className="text-slate-400 mt-2">
              Review the predicted impact before approving this action.
            </p>


            {/* Predicted Results */}
            <div className="grid grid-cols-3 gap-4 mt-7">

              <div className="bg-slate-800 rounded-xl p-4">

                <p className="text-sm text-slate-400">
                  Predicted Crowd
                </p>

                <p className="text-2xl font-bold mt-2">
                  {selectedStrategy === "A" ? "68%" : "73%"}
                </p>

              </div>


              <div className="bg-slate-800 rounded-xl p-4">

                <p className="text-sm text-slate-400">
                  Network Capacity
                </p>

                <p className="text-2xl font-bold mt-2">
                  {selectedStrategy === "A" ? "72%" : "61%"}
                </p>

              </div>


              <div className="bg-slate-800 rounded-xl p-4">

                <p className="text-sm text-slate-400">
                  Risk
                </p>

                <p
                  className={`text-2xl font-bold mt-2 ${
                    selectedStrategy === "A"
                      ? "text-green-400"
                      : "text-yellow-400"
                  }`}
                >
                  {selectedStrategy === "A" ? "Low" : "Medium"}
                </p>

              </div>

            </div>


            {/* Simulation Notice */}
            <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">

              <p className="text-sm text-blue-300">
                This is a simulated prediction. The organizer can approve
                the strategy after reviewing its expected impact.
              </p>

            </div>


            {/* Buttons */}
            <div className="flex justify-end gap-3 mt-7">

              <button
                onClick={() => setReviewOpen(false)}
                className="px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800"
              >
                Back
              </button>

              <button
                onClick={() => {
                 setStrategyApproved(true)
                 setExecutionStatus("Executing")
                 setExecutionProgress(10)

                 setActivityLog((current) => [
                   {
                     time: "Just now",
                     message: `Strategy ${selectedStrategy} approved and execution started`,
                     type: "success",
                    },
                    ...current,
                 ])

                 setReviewOpen(false)
                 setSandboxOpen(false)
                }}
                className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 font-medium"
              >
                Approve Strategy
              </button>

            </div>

          </div>

        </div>
      )}


      {/* ==================== APPROVED NOTIFICATION ==================== */}
      {strategyApproved && (
        <div className="fixed bottom-6 right-6 z-[70] bg-green-500/10 border border-green-500/30 rounded-xl p-5 shadow-xl">

          <p className="text-green-400 font-semibold">
            Strategy approved
          </p>

          <p className="text-sm text-slate-300 mt-1">
            Strategy {selectedStrategy} is now being executed.
          </p>

          <button
            onClick={() => setStrategyApproved(false)}
            className="text-xs text-slate-400 hover:text-white mt-3"
          >
            Dismiss
          </button>

        </div>
      )}

       {strategyApproved && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg">
          Strategy approved & execution started
        </div>
      )}

     </main>
    </div>
  )
}

export default App