import type { ThemeClasses } from "../theme"

const NAV_ITEMS = [
  "Overview",
  "Crowd Monitor",
  "Predictions",
  "Sandbox",
  "Strategies",
  "Settings",
]

type Props = {
  themeClasses: ThemeClasses
  isDark: boolean
  activePage: string
  backendConnected: boolean
  onSelectPage: (item: string) => void
}

export default function AppSidebar({
  themeClasses,
  isDark,
  activePage,
  backendConnected,
  onSelectPage,
}: Props) {
  return (
    <aside
      className={`w-full md:w-64 border-b md:border-b-0 md:border-r p-5 transition-colors duration-300 ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className={themeClasses("mb-8")}>
        <h1 className={themeClasses("text-2xl font-bold")}>EventFlow</h1>
        <p className={themeClasses("text-sm text-slate-400 mt-1")}>Command Center</p>
      </div>

      <nav className={themeClasses("space-y-2")}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item}
            onClick={() => onSelectPage(item)}
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
        <p className={themeClasses("text-xs text-slate-500 uppercase")}>System</p>

        <div className={themeClasses("flex items-center gap-2 mt-3")}>
          <div className={`w-2.5 h-2.5 rounded-full ${backendConnected ? "bg-green-400" : "bg-amber-400"}`} />
          <span className={themeClasses("text-sm text-slate-300")}>
            {backendConnected ? "Backend connected" : "Backend unavailable"}
          </span>
        </div>
      </div>
    </aside>
  )
}
