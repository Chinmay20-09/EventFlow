import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  selectedStrategy: string | null
  liveVisitors: number
  networkCapacity: number
}

export default function StatsCards({
  themeClasses,
  selectedStrategy,
  liveVisitors,
  networkCapacity,
}: Props) {
  return (
    <section className={themeClasses("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6")}>
      {/* Crowd Level */}
      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
        <div className={themeClasses("flex items-center justify-between")}>
          <span className={themeClasses("text-2xl")}>👥</span>
          <span className={themeClasses("text-xs text-red-400")}>High</span>
        </div>

        <p className={themeClasses("text-slate-400 text-sm mt-5")}>Crowd Level</p>

        <p className={themeClasses("text-3xl font-bold mt-1")}>
          {selectedStrategy === "A" ? "68%" : selectedStrategy === "B" ? "73%" : "78%"}
        </p>
      </div>

      {/* Live Visitors */}
      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
        <div className={themeClasses("flex items-center justify-between")}>
          <span className={themeClasses("text-2xl")}>🎟️</span>
          <span className={themeClasses("text-xs text-green-400")}>LIVE</span>
        </div>

        <p className={themeClasses("text-slate-400 text-sm mt-5")}>Live Visitors</p>

        <p className={themeClasses("text-3xl font-bold mt-1")}>{liveVisitors.toLocaleString()}</p>

        <p className={themeClasses("text-green-400 text-xs mt-2")}>Updating every 2 sec</p>
      </div>

      {/* Network Capacity */}
      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
        <div className={themeClasses("flex items-center justify-between")}>
          <span className={themeClasses("text-2xl")}>🚌</span>
          <span className={themeClasses("text-xs text-blue-400")}>Stable</span>
        </div>

        <p className={themeClasses("text-slate-400 text-sm mt-5")}>Network Capacity</p>

        <p className={themeClasses("text-3xl font-bold mt-1")}>{networkCapacity}%</p>
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
  )
}
