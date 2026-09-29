import CustomInputDialog from "../CustomInputDialog"
import type { StoredEvent } from "../api"
import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  isDark: boolean
  eventName: string
  currentTime: Date
  alertCount: number
  onToggleTheme: () => void
  onOpenSandbox: () => void
  onStored: (record: StoredEvent) => void
}

export default function AppHeader({
  themeClasses,
  isDark,
  eventName,
  currentTime,
  alertCount,
  onToggleTheme,
  onOpenSandbox,
  onStored,
}: Props) {
  return (
    <header className={themeClasses("flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8")}>
      <div>
        <p className={themeClasses("text-sm text-blue-400 font-medium")}>LIVE EVENT</p>

        <h2 className={themeClasses("text-3xl font-bold mt-1")}>{eventName}</h2>

        <p className={themeClasses("text-slate-400 mt-1")}>
          Organizer Command Center · Monitoring live conditions
        </p>
      </div>

      <div className={themeClasses("flex flex-wrap items-center justify-end gap-3")}>
        <div className={themeClasses("text-right")}>
          <p className={themeClasses("text-xs text-slate-400")}>LOCAL TIME</p>
          <p className={themeClasses("font-semibold")}>{currentTime.toLocaleTimeString()}</p>
        </div>

        <div className={themeClasses("px-4 py-2 rounded-lg border border-slate-700 bg-slate-900")}>
          <span className={themeClasses("text-sm text-slate-400")}>Status</span>
          <span className={themeClasses("ml-2 text-green-400 font-medium")}>LIVE</span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
          title={`Switch to ${isDark ? "light" : "dark"} mode`}
          className={`px-3 py-2 rounded-lg border transition-colors duration-300 ${themeClasses(
            "border-slate-700 bg-slate-800 hover:bg-slate-700",
          )}`}
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        <button
          onClick={onOpenSandbox}
          className={themeClasses("px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium")}
        >
          Open Sandbox
        </button>

        {/* Event creation is available after backend authentication. */}
        <CustomInputDialog themeClasses={themeClasses} isDark={isDark} onStored={onStored} />

        <div className={themeClasses("relative")}>
          <button className={themeClasses("p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xl")}>
            🔔
          </button>

          <span
            className={themeClasses(
              "absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center",
            )}
          >
            {alertCount}
          </span>
        </div>

        <div className={themeClasses("w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold")}>
          O
        </div>
      </div>
    </header>
  )
}
