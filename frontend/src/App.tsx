import { useEffect, useState } from "react"
import DigitalTwinPanel from "./components/DigitalTwinPanel"

function App() {
  const [isDark, setIsDark] = useState(true)
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
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
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
    : selectedStrategy === "B"
    ? [
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
    : [
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

  const handleLogin = () => {
  if (!email.trim() || !password.trim()) {
    setLoginError("Please enter email and password")
    return
  }

  setLoginError("")
  setIsLoggedIn(true)
}

const handleShareMap = async () => {
  const mapData = `
EventFlow Crowd Map

Nodes:
A - North Gate
B - Central Zone
C - East Zone
D - Transit Hub

Current Status:
North Gate: ${northGateCrowd}%
East Zone: ${eastZoneCrowd}%
Transit: ${transitCapacity}%
`

  await navigator.clipboard.writeText(mapData)
  alert("Crowd map copied successfully!")
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
          AI Event Command Center
        </p>

        <div className={themeClasses("mt-8 space-y-4")}>
          <div>
            <label className={themeClasses("text-sm text-slate-300")}>Email</label>
            <input
              type="email"
              placeholder="organizer@event.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full mt-2 rounded-lg px-4 py-3 outline-none focus:border-blue-500 ${themeClasses("bg-slate-800 border border-slate-700")} ${isDark ? "text-white" : "text-slate-900"}`}
            />
          </div>

          <div>
            <label className={themeClasses("text-sm text-slate-300")}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full mt-2 rounded-lg px-4 py-3 outline-none focus:border-blue-500 ${themeClasses("bg-slate-800 border border-slate-700")} ${isDark ? "text-white" : "text-slate-900"}`}
            />
          </div>

          {loginError && (
            <p className={themeClasses("text-red-400 text-sm")}>{loginError}</p>
          )}

          <button
            onClick={handleLogin}
            className={themeClasses("w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-3 font-semibold text-white")}
          >
            Login
          </button>
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
              All systems operational
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

  <div className={themeClasses("px-4 py-2 rounded-lg border border-slate-700 bg-slate-900")}>
    <span className={themeClasses("text-sm text-slate-400")}>Status</span>
    <span className={themeClasses("ml-2 text-green-400 font-medium")}>LIVE</span>
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


        {/* ==================== STATS ==================== */}
        <section className={themeClasses("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6")}>

          {/* Crowd Level */}
<div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
  <div className={themeClasses("flex items-center justify-between")}>
    <span className={themeClasses("text-2xl")}>👥</span>
    <span className={themeClasses("text-xs text-red-400")}>High</span>
  </div>

  <p className={themeClasses("text-slate-400 text-sm mt-5")}>Crowd Level</p>

  <p className={themeClasses("text-3xl font-bold mt-1")}>
    {selectedStrategy === "A"
      ? "68%"
      : selectedStrategy === "B"
      ? "73%"
      : "78%"}
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
    {liveVisitors.toLocaleString()}
  </p>

  <p className={themeClasses("text-green-400 text-xs mt-2")}>
    Updating every 2 sec
  </p>
</div>

{/* Network Capacity */}
<div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
  <div className={themeClasses("flex items-center justify-between")}>
    <span className={themeClasses("text-2xl")}>🚌</span>
    <span className={themeClasses("text-xs text-blue-400")}>Stable</span>
  </div>

  <p className={themeClasses("text-slate-400 text-sm mt-5")}>Network Capacity</p>

  <p className={themeClasses("text-3xl font-bold mt-1")}>
    {networkCapacity}%
  </p>
</div>

{/* Risk Level */}
<div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
  <div className={themeClasses("flex items-center justify-between")}>
    <span className={themeClasses("text-2xl")}>🛡️</span>
    <span className={themeClasses("text-xs text-yellow-400")}>Monitoring</span>
  </div>

  <p className={themeClasses("text-slate-400 text-sm mt-5")}>Risk Level</p>

  <p className={themeClasses("text-3xl font-bold mt-1")}>
    {selectedStrategy === "A" ? "Low" : "Medium"}
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
                       Simulation active: Strategy {selectedStrategy}
                      </span>
                    )}
                  </div>

                  <div className={themeClasses("flex items-center gap-2")}>
  <span className={themeClasses("text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400")}>
    {selectedStrategy ? "SIMULATION" : "LIVE DATA"}
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
    <p className={themeClasses("text-xs text-slate-400 uppercase")}>Selected Dropper</p>

    <h4 className={themeClasses("text-lg font-semibold mt-1")}>
      {selectedNode === "A" && "North Gate"}
      {selectedNode === "B" && "Central Zone"}
      {selectedNode === "C" && "East Zone"}
      {selectedNode === "D" && "Transit Hub"}
    </h4>

    <div className={themeClasses("grid grid-cols-3 gap-3 mt-3")}>
      <div>
        <p className={themeClasses("text-xs text-slate-500")}>Utilization</p>
        <p className={themeClasses("font-bold")}>
          {selectedNode === "A" && `${northGateCrowd}%`}
          {selectedNode === "B" && "78%"}
          {selectedNode === "C" && `${eastZoneCrowd}%`}
          {selectedNode === "D" && `${transitCapacity}%`}
        </p>
      </div>

      <div>
        <p className={themeClasses("text-xs text-slate-500")}>Status</p>
        <p className={themeClasses("font-bold")}>
          {selectedNode === "A" && "Critical"}
          {selectedNode === "B" && "Busy"}
          {selectedNode === "C" && "Low"}
          {selectedNode === "D" && "Stable"}
        </p>
      </div>

      <div>
        <p className={themeClasses("text-xs text-slate-500")}>Node</p>
        <p className={themeClasses("font-bold")}>{selectedNode}</p>
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
    key={alert.title}
    className={themeClasses("border border-slate-800 rounded-lg p-4 space-y-2")}
  >
    <div className={themeClasses("flex justify-between items-start")}>
      <div>
        <p className={themeClasses("text-xs text-blue-400 font-medium")}>
          {alert.type}
        </p>

        <h4 className={themeClasses("font-semibold mt-1")}>
          {alert.title}
        </h4>
      </div>

      <span
        className={`text-xs px-2 py-1 rounded ${
          alert.severity === "HIGH"
            ? "bg-red-500/10 text-red-400"
            : alert.severity === "MEDIUM"
            ? "bg-yellow-500/10 text-yellow-400"
            : "bg-green-500/10 text-green-400"
        }`}
      >
        {alert.severity}
      </span>
    </div>

    <p className={themeClasses("text-sm text-slate-300")}>
      📍 {alert.location}
    </p>

    <p className={themeClasses("text-xs text-slate-500")}>
      🕒 {alert.time}
    </p>

    <p className={themeClasses("text-sm text-slate-400")}>
      {alert.description}
    </p>

    <div className={themeClasses("bg-slate-800 rounded-md p-3")}>
      <p className={themeClasses("text-xs text-green-400 font-medium")}>
        Recommended Action
      </p>

      <p className={themeClasses("text-sm mt-1")}>
        {alert.action}
      </p>
    </div>
  </div>
))}

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
                    {executionStatus === "Executing"
                      ? `Strategy ${selectedStrategy} is being executed`
                      : executionStatus === "Completed"
                      ? `Strategy ${selectedStrategy} execution completed`
                      : "No active strategy"}
                  </h3>

                  <p className={themeClasses("text-sm text-slate-400 mt-2")}>
                    {executionStatus === "Executing"
                      ? "Operational changes are being monitored in real time."
                      : "Simulate and approve a strategy to begin execution."}
                  </p>

                </div>

                <div className={themeClasses("flex items-center gap-3")}>

                  <div
                    className={`w-3 h-3 rounded-full ${
                      executionStatus === "Executing"
                        ? "bg-blue-400 animate-pulse"
                        : isDark ? "bg-slate-600" : "bg-slate-300"
                    }`}
                  />

                  <span className={themeClasses("font-medium")}>
                    {executionStatus}
                  </span>

                </div>

              </div>


              {(executionStatus === "Executing" ||
                executionStatus === "Completed") && (
                <div className={themeClasses("mt-5")}>

                  <div className={themeClasses("flex justify-between text-sm mb-2")}>

                    <span className={themeClasses("text-slate-400")}>
                      Execution progress
                    </span>

                    <span>
                      {executionProgress}%
                    </span>

                  </div>

                  <div className={themeClasses("h-2 bg-slate-800 rounded-full overflow-hidden")}>
                    <div 
                     className={themeClasses("h-2 bg-blue-500 rounded-full transition-all duration-700")}
                     style={{ width: `${executionProgress}%` }}
                    />
                  </div>

                </div>
              )}

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
                key={`${activity.time}-${index}`}
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
                    {activity.time}
                  </p>

                </div>

              </div>
            ))}

          </div>

        </div>

          </>
        )}

        {/* ==================== WEATHER DIGITAL TWIN (midnight task) ==================== */}
        {activePage === "Overview" && (
          <DigitalTwinPanel themeClasses={themeClasses} isDark={isDark} />
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

             {[
  ["North Gate", `${northGateCrowd}%`, northGateCrowd >= 85 ? "HIGH" : "NORMAL"],
  ["Central Zone", "78%", "HIGH"],
  ["East Zone", `${eastZoneCrowd}%`, "NORMAL"],
  ["Transit", `${transitCapacity}%`, "STABLE"],
].map(([zone, level, status]) => (
                <div
                  key={zone}
                  className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}
                >

                  <p className={themeClasses("text-slate-400 text-sm")}>
                    {zone}
                  </p>

                  <p className={themeClasses("text-3xl font-bold mt-2")}>
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


            <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>

              <h3 className={themeClasses("text-lg font-semibold")}>
                Crowd Movement
              </h3>

              <p className={themeClasses("text-sm text-slate-400 mt-1")}>
                Current movement between zones
              </p>


              <div className={themeClasses("mt-6 space-y-5")}>

                <div>

                  <div className={themeClasses("flex justify-between text-sm mb-2")}>
                    <span>
                      North Gate → Central Zone
                    </span>

                    <span className={themeClasses("text-red-400")}>
                      High flow
                    </span>
                  </div>

                  <div className={themeClasses("h-3 bg-slate-800 rounded-full")}>
                    <div className={themeClasses("h-3 w-[85%] bg-red-500 rounded-full")} />
                  </div>

                </div>


                <div>

                  <div className={themeClasses("flex justify-between text-sm mb-2")}>
                    <span>
                      Central Zone → East Zone
                    </span>

                    <span className={themeClasses("text-yellow-400")}>
                      Moderate
                    </span>
                  </div>

                  <div className={themeClasses("h-3 bg-slate-800 rounded-full")}>
                    <div className={themeClasses("h-3 w-[55%] bg-yellow-500 rounded-full")} />
                  </div>

                </div>


                <div>

                  <div className={themeClasses("flex justify-between text-sm mb-2")}>
                    <span>
                      East Zone → Transit
                    </span>

                    <span className={themeClasses("text-green-400")}>
                      Normal
                    </span>
                  </div>

                  <div className={themeClasses("h-3 bg-slate-800 rounded-full")}>
                    <div className={themeClasses("h-3 w-[35%] bg-green-500 rounded-full")} />
                  </div>

                </div>

              </div>
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
        Forecasted congestion generated from the EventFlow simulation engine.
      </p>
    </div>

    {/* Forecast Cards */}
    <div className={themeClasses("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4")}>

      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
        <p className={themeClasses("text-slate-400 text-sm")}>North Gate</p>
        <p className={themeClasses("text-3xl font-bold text-red-400 mt-2")}>89%</p>
        <p className={themeClasses("text-xs text-red-300 mt-2")}>+12% expected</p>
      </div>

      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
        <p className={themeClasses("text-slate-400 text-sm")}>Central Zone</p>
        <p className={themeClasses("text-3xl font-bold text-yellow-400 mt-2")}>74%</p>
        <p className={themeClasses("text-xs text-yellow-300 mt-2")}>Moderate density</p>
      </div>

      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
        <p className={themeClasses("text-slate-400 text-sm")}>East Zone</p>
        <p className={themeClasses("text-3xl font-bold text-green-400 mt-2")}>58%</p>
        <p className={themeClasses("text-xs text-green-300 mt-2")}>Stable flow</p>
      </div>

      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
        <p className={themeClasses("text-slate-400 text-sm")}>Transit</p>
        <p className={themeClasses("text-3xl font-bold text-blue-400 mt-2")}>71%</p>
        <p className={themeClasses("text-xs text-blue-300 mt-2")}>Normal operation</p>
      </div>

    </div>

    {/* Forecast Timeline */}
    <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>
      <h3 className={themeClasses("text-xl font-semibold mb-5")}>
        Predicted Crowd Growth
      </h3>

      <svg viewBox="0 0 600 220" className={themeClasses("w-full h-auto")}>

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

      <div className={themeClasses("mt-4 flex items-center gap-2 text-sm text-slate-400")}>
        <div className={themeClasses("w-4 h-1 bg-red-500 rounded")}/>
        North Gate forecast
      </div>
    </div>

    {/* AI Recommendation */}
    <div className={themeClasses("bg-blue-500/10 border border-blue-500/20 rounded-xl p-5")}>
      <p className={themeClasses("text-blue-300 text-sm font-medium")}>
        AI RECOMMENDATION
      </p>

     <h3 className={themeClasses("text-xl font-semibold mt-2")}>
  {selectedStrategy === "A"
    ? "Strategy A successfully reduces congestion"
    : selectedStrategy === "B"
    ? "Additional gate stabilizes entry flow"
    : "Open an additional North Gate within 20 minutes"}
</h3>
      <button
  onClick={() => setSandboxOpen(true)}
  className={themeClasses("mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium")}
>
  Test Response in Sandbox
</button>

      <p className={themeClasses("text-slate-300 mt-3")}>
        Forecast indicates congestion may exceed 85% between 30–60 minutes.
        Early intervention is expected to reduce peak crowd density.
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

              {/* Strategy A */}
              <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>

                <div className={themeClasses("flex justify-between")}>

                  <h3 className={themeClasses("text-lg font-semibold")}>
                    Redirect Crowd
                  </h3>

                  <span className={themeClasses("text-xs text-green-400")}>
                    LOW RISK
                  </span>

                </div>

                <p className={themeClasses("text-slate-400 text-sm mt-3")}>
                  Redirect incoming crowd from North Gate toward East Zone.
                </p>

                <button
                  onClick={() => setSandboxOpen(true)}
                  className={themeClasses("mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium")}
                >
                  Test Strategy
                </button>

              </div>


              {/* Strategy B */}
              <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>

                <div className={themeClasses("flex justify-between")}>

                  <h3 className={themeClasses("text-lg font-semibold")}>
                    Open Additional Gate
                  </h3>

                  <span className={themeClasses("text-xs text-yellow-400")}>
                    MEDIUM RISK
                  </span>

                </div>

                <p className={themeClasses("text-slate-400 text-sm mt-3")}>
                  Increase entry capacity by opening an additional access point.
                </p>

                <button
                  onClick={() => setSandboxOpen(true)}
                  className={themeClasses("mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium")}
                >
                  Test Strategy
                </button>

              </div>

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

      <button className={themeClasses("w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium")}>
        Save Settings
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
          Compare AI-generated strategies against current event conditions.
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
          {selectedStrategy === "A"
            ? "68%"
            : selectedStrategy === "B"
            ? "73%"
            : "78%"}
        </p>
      </div>

      <div className={themeClasses("bg-slate-800 rounded-lg p-4")}>
        <p className={themeClasses("text-xs text-slate-400")}>North Gate</p>
        <p className={themeClasses("text-2xl font-bold mt-2 text-red-400")}>
          {selectedStrategy === "A" ? "Reduced" : "High"}
        </p>
      </div>

      <div className={themeClasses("bg-slate-800 rounded-lg p-4")}>
        <p className={themeClasses("text-xs text-slate-400")}>Network Capacity</p>
        <p className={themeClasses("text-2xl font-bold mt-2")}>
          {selectedStrategy === "A"
            ? "72%"
            : selectedStrategy === "B"
            ? "61%"
            : "64%"}
        </p>
      </div>

      <div className={themeClasses("bg-slate-800 rounded-lg p-4")}>
        <p className={themeClasses("text-xs text-slate-400")}>Risk</p>
        <p className={themeClasses("text-2xl font-bold mt-2 text-yellow-400")}>
          {selectedStrategy === "A" ? "Low" : "Medium"}
        </p>
      </div>

    </div>
  </section>
)}


      {/* ==================== SANDBOX MODAL ==================== */}
      {sandboxOpen && (
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


      {/* ==================== STRATEGY REVIEW MODAL ==================== */}
      {reviewOpen && selectedStrategy && (
        <div className={themeClasses("fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-[60]")}>

          <div className={themeClasses("w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-7 shadow-2xl")}>

            <p className={themeClasses("text-blue-400 text-sm font-medium")}>
              STRATEGY REVIEW
            </p>

            <h2 className={themeClasses("text-2xl font-bold mt-1")}>
              Strategy {selectedStrategy}
            </h2>

            <p className={themeClasses("text-slate-400 mt-2")}>
              Review the predicted impact before approving this action.
            </p>


            {/* Predicted Results */}
            <div className={themeClasses("grid grid-cols-1 sm:grid-cols-3 gap-4 mt-7")}>

              <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>

                <p className={themeClasses("text-sm text-slate-400")}>
                  Predicted Crowd
                </p>

                <p className={themeClasses("text-2xl font-bold mt-2")}>
                  {selectedStrategy === "A" ? "68%" : "73%"}
                </p>

              </div>


              <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>

                <p className={themeClasses("text-sm text-slate-400")}>
                  Network Capacity
                </p>

                <p className={themeClasses("text-2xl font-bold mt-2")}>
                  {selectedStrategy === "A" ? "72%" : "61%"}
                </p>

              </div>


              <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>

                <p className={themeClasses("text-sm text-slate-400")}>
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
            <div className={themeClasses("mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4")}>

              <p className={themeClasses("text-sm text-blue-300")}>
                This is a simulated prediction. The organizer can approve
                the strategy after reviewing its expected impact.
              </p>

            </div>


            {/* Buttons */}
            <div className={themeClasses("flex justify-end gap-3 mt-7")}>

              <button
                onClick={() => setReviewOpen(false)}
                className={themeClasses("px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800")}
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
                className={themeClasses("px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 font-medium")}
              >
                Approve Strategy
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
            Strategy {selectedStrategy} is now being executed.
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