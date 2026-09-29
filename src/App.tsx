import { useEffect, useRef, useState } from "react"
import { getApiHealth, login as loginToApi } from "./api"
import type { ApiHealth, StoredEvent } from "./api"
import { createThemeClasses } from "./theme"
import { alertsForStrategy } from "./components/alerts"
import ActivityTimeline from "./components/ActivityTimeline"
import type { ActivityItem } from "./components/ActivityTimeline"
import AppHeader from "./components/AppHeader"
import AppSidebar from "./components/AppSidebar"
import ApprovedNotification from "./components/ApprovedNotification"
import CrowdMonitorPage from "./components/CrowdMonitorPage"
import DigitalTwinPanel from "./components/DigitalTwinPanel"
import ExecutionStatusPanel from "./components/ExecutionStatusPanel"
import LiveCrowdMap from "./components/LiveCrowdMap"
import PredictiveAlerts from "./components/PredictiveAlerts"
import PredictionsPage from "./components/PredictionsPage"
import SandboxModal from "./components/SandboxModal"
import SandboxTeaser from "./components/SandboxTeaser"
import SettingsPage from "./components/SettingsPage"
import StatsCards from "./components/StatsCards"
import StoredCustomInputCard from "./components/StoredCustomInputCard"
import StrategiesPage from "./components/StrategiesPage"
import StrategyReviewModal from "./components/StrategyReviewModal"

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
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null)
  const [storedCustomInput, setStoredCustomInput] = useState<StoredEvent | null>(null)
  const [selectedNode, setSelectedNode] = useState("A")
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([
    { time: "2 min ago", message: "Crowd buildup detected at North Gate", type: "alert" },
    { time: "5 min ago", message: "Transit capacity decreased to 64%", type: "warning" },
    { time: "8 min ago", message: "Weather disruption detected in East Zone", type: "warning" },
  ])

  useEffect(() => {
    let active = true

    const checkApi = async () => {
      try {
        const health = await getApiHealth()
        if (active) {
          setApiHealth(health)
        }
      } catch {
        if (active) {
          setApiHealth(null)
        }
      }
    }

    void checkApi()
    const interval = setInterval(() => void checkApi(), 15000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  // Auth screen removed for now: auto-sign-in as the default admin account
  // (admin / admin123), which the backend seeds at startup. The attempt runs
  // once the health check first reports the backend as reachable.
  const autoLoginAttempted = useRef(false)
  useEffect(() => {
    if (!apiHealth || autoLoginAttempted.current) return
    autoLoginAttempted.current = true
    loginToApi("admin", "admin123").catch((error) => {
      console.error(
        "Default admin auto-login failed:",
        error instanceof Error ? error.message : error,
      )
    })
  }, [apiHealth])

  // Execution progress ticks once per second once a strategy is approved.
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

  // Simulated live visitor count.
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveVisitors((current) => {
        const change = Math.floor(Math.random() * 9) - 4
        return Math.max(18000, current + change)
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  // Header clock.
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const themeClasses = createThemeClasses(isDark)

  const northGateCrowd = selectedStrategy === "A" ? 68 : selectedStrategy === "B" ? 73 : 92
  const eastZoneCrowd = selectedStrategy === "A" ? 68 : 54
  const transitCapacity = selectedStrategy === "A" ? 72 : selectedStrategy === "B" ? 61 : 64
  const networkCapacity = transitCapacity
  const alertCount = alertsForStrategy(selectedStrategy).length

  const handleSelectPage = (item: string) => {
    setActivePage(item)

    if (item === "Sandbox") {
      setSandboxOpen(true)
    }
  }

  const closeSandbox = () => {
    setSandboxOpen(false)
    setSelectedStrategy(null)
  }

  const approveStrategy = () => {
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

  return (
    <div
      className={`min-h-screen flex flex-col md:flex-row transition-colors duration-300 ${
        isDark ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-900"
      }`}
    >
      <AppSidebar
        themeClasses={themeClasses}
        isDark={isDark}
        activePage={activePage}
        backendConnected={apiHealth !== null}
        onSelectPage={handleSelectPage}
      />

      {/* ==================== MAIN CONTENT ==================== */}
      <main className={themeClasses("flex-1 p-8")}>
        <AppHeader
          themeClasses={themeClasses}
          isDark={isDark}
          eventName={eventName}
          currentTime={currentTime}
          alertCount={alertCount}
          onToggleTheme={() => setIsDark((current) => !current)}
          onOpenSandbox={() => setSandboxOpen(true)}
          onStored={setStoredCustomInput}
        />

        <StatsCards
          themeClasses={themeClasses}
          selectedStrategy={selectedStrategy}
          liveVisitors={liveVisitors}
          networkCapacity={networkCapacity}
        />

        {/* ==================== OVERVIEW ==================== */}
        {activePage === "Overview" && (
          <>
            <section className={themeClasses("grid grid-cols-1 xl:grid-cols-3 gap-6")}>
              <LiveCrowdMap
                themeClasses={themeClasses}
                selectedStrategy={selectedStrategy}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
                onShare={handleShareMap}
                northGateCrowd={northGateCrowd}
                eastZoneCrowd={eastZoneCrowd}
                transitCapacity={transitCapacity}
              />

              <PredictiveAlerts themeClasses={themeClasses} selectedStrategy={selectedStrategy} />
            </section>

            <ExecutionStatusPanel
              themeClasses={themeClasses}
              isDark={isDark}
              executionStatus={executionStatus}
              executionProgress={executionProgress}
              selectedStrategy={selectedStrategy}
            />

            <ActivityTimeline themeClasses={themeClasses} activityLog={activityLog} />

            {/* Custom Input feature: the record stored via P3 and re-fetched from
                the backend (PostgreSQL is the source of truth). */}
            <StoredCustomInputCard themeClasses={themeClasses} record={storedCustomInput} />
          </>
        )}

        {/* ==================== WEATHER DIGITAL TWIN (midnight task) ==================== */}
        {activePage === "Overview" && (
          <DigitalTwinPanel themeClasses={themeClasses} isDark={isDark} />
        )}

        {/* ==================== CROWD MONITOR ==================== */}
        {activePage === "Crowd Monitor" && (
          <CrowdMonitorPage
            themeClasses={themeClasses}
            northGateCrowd={northGateCrowd}
            eastZoneCrowd={eastZoneCrowd}
            transitCapacity={transitCapacity}
          />
        )}

        {/* ==================== PREDICTIONS ==================== */}
        {activePage === "Predictions" && (
          <PredictionsPage
            themeClasses={themeClasses}
            selectedStrategy={selectedStrategy}
            onOpenSandbox={() => setSandboxOpen(true)}
          />
        )}

        {/* ==================== STRATEGIES ==================== */}
        {activePage === "Strategies" && (
          <StrategiesPage themeClasses={themeClasses} onOpenSandbox={() => setSandboxOpen(true)} />
        )}

        {/* ==================== SETTINGS ==================== */}
        {activePage === "Settings" && (
          <SettingsPage
            themeClasses={themeClasses}
            isDark={isDark}
            eventName={eventName}
            onEventNameChange={setEventName}
            maxCapacity={maxCapacity}
            onMaxCapacityChange={setMaxCapacity}
            alertThreshold={alertThreshold}
            onAlertThresholdChange={setAlertThreshold}
            autoAlerts={autoAlerts}
            onToggleAutoAlerts={() => setAutoAlerts(!autoAlerts)}
          />
        )}

        {/* ==================== SANDBOX SECTION ==================== */}
        {activePage === "Overview" && (
          <SandboxTeaser
            themeClasses={themeClasses}
            selectedStrategy={selectedStrategy}
            onOpenSandbox={() => setSandboxOpen(true)}
          />
        )}

        {/* ==================== SANDBOX MODAL ==================== */}
        {sandboxOpen && (
          <SandboxModal
            themeClasses={themeClasses}
            isDark={isDark}
            networkCapacity={networkCapacity}
            selectedStrategy={selectedStrategy}
            onSelectStrategy={setSelectedStrategy}
            onClose={closeSandbox}
            onReview={() => setReviewOpen(true)}
          />
        )}

        {/* ==================== STRATEGY REVIEW MODAL ==================== */}
        {reviewOpen && selectedStrategy && (
          <StrategyReviewModal
            themeClasses={themeClasses}
            selectedStrategy={selectedStrategy}
            onBack={() => setReviewOpen(false)}
            onApprove={approveStrategy}
          />
        )}

        {/* ==================== APPROVED NOTIFICATION ==================== */}
        {strategyApproved && (
          <ApprovedNotification
            themeClasses={themeClasses}
            selectedStrategy={selectedStrategy}
            onDismiss={() => setStrategyApproved(false)}
          />
        )}
      </main>
    </div>
  )
}

export default App
