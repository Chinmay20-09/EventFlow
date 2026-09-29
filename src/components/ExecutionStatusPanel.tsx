import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  isDark: boolean
  executionStatus: string
  executionProgress: number
  selectedStrategy: string | null
}

export default function ExecutionStatusPanel({
  themeClasses,
  isDark,
  executionStatus,
  executionProgress,
  selectedStrategy,
}: Props) {
  const running = executionStatus === "Executing"
  const started = running || executionStatus === "Completed"

  return (
    <div className={themeClasses("mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6")}>
      <div className={themeClasses("flex items-center justify-between")}>
        <div>
          <p className={themeClasses("text-blue-400 text-sm font-medium")}>EXECUTION STATUS</p>

          <h3 className={themeClasses("text-xl font-semibold mt-1")}>
            {running
              ? `Strategy ${selectedStrategy} is being executed`
              : executionStatus === "Completed"
              ? `Strategy ${selectedStrategy} execution completed`
              : "No active strategy"}
          </h3>

          <p className={themeClasses("text-sm text-slate-400 mt-2")}>
            {running
              ? "Operational changes are being monitored in real time."
              : "Simulate and approve a strategy to begin execution."}
          </p>
        </div>

        <div className={themeClasses("flex items-center gap-3")}>
          <div
            className={`w-3 h-3 rounded-full ${
              running ? "bg-blue-400 animate-pulse" : isDark ? "bg-slate-600" : "bg-slate-300"
            }`}
          />

          <span className={themeClasses("font-medium")}>{executionStatus}</span>
        </div>
      </div>

      {started && (
        <div className={themeClasses("mt-5")}>
          <div className={themeClasses("flex justify-between text-sm mb-2")}>
            <span className={themeClasses("text-slate-400")}>Execution progress</span>

            <span>{executionProgress}%</span>
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
  )
}
