import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  selectedStrategy: string | null
  onOpenSandbox: () => void
}

export default function SandboxTeaser({ themeClasses, selectedStrategy, onOpenSandbox }: Props) {
  return (
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
          onClick={onOpenSandbox}
          className={themeClasses("px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium")}
        >
          Open Sandbox
        </button>
      </div>

      <div className={themeClasses("mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4")}>
        <div className={themeClasses("bg-slate-800 rounded-lg p-4")}>
          <p className={themeClasses("text-xs text-slate-400")}>Crowd Level</p>
          <p className={themeClasses("text-2xl font-bold mt-2")}>
            {selectedStrategy === "A" ? "68%" : selectedStrategy === "B" ? "73%" : "78%"}
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
            {selectedStrategy === "A" ? "72%" : selectedStrategy === "B" ? "61%" : "64%"}
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
  )
}
