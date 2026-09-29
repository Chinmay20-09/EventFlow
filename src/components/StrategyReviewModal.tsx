import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  selectedStrategy: string
  onBack: () => void
  onApprove: () => void
}

export default function StrategyReviewModal({
  themeClasses,
  selectedStrategy,
  onBack,
  onApprove,
}: Props) {
  return (
    <div className={themeClasses("fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-[60]")}>
      <div
        className={themeClasses(
          "w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-7 shadow-2xl",
        )}
      >
        <p className={themeClasses("text-blue-400 text-sm font-medium")}>STRATEGY REVIEW</p>

        <h2 className={themeClasses("text-2xl font-bold mt-1")}>Strategy {selectedStrategy}</h2>

        <p className={themeClasses("text-slate-400 mt-2")}>
          Review the predicted impact before approving this action.
        </p>

        {/* Predicted Results */}
        <div className={themeClasses("grid grid-cols-1 sm:grid-cols-3 gap-4 mt-7")}>
          <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>
            <p className={themeClasses("text-sm text-slate-400")}>Predicted Crowd</p>

            <p className={themeClasses("text-2xl font-bold mt-2")}>
              {selectedStrategy === "A" ? "68%" : "73%"}
            </p>
          </div>

          <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>
            <p className={themeClasses("text-sm text-slate-400")}>Network Capacity</p>

            <p className={themeClasses("text-2xl font-bold mt-2")}>
              {selectedStrategy === "A" ? "72%" : "61%"}
            </p>
          </div>

          <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>
            <p className={themeClasses("text-sm text-slate-400")}>Risk</p>

            <p
              className={`text-2xl font-bold mt-2 ${
                selectedStrategy === "A" ? "text-green-400" : "text-yellow-400"
              }`}
            >
              {selectedStrategy === "A" ? "Low" : "Medium"}
            </p>
          </div>
        </div>

        {/* Simulation Notice */}
        <div className={themeClasses("mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4")}>
          <p className={themeClasses("text-sm text-blue-300")}>
            This is a simulated prediction. The organizer can approve the strategy after reviewing
            its expected impact.
          </p>
        </div>

        {/* Buttons */}
        <div className={themeClasses("flex justify-end gap-3 mt-7")}>
          <button
            onClick={onBack}
            className={themeClasses("px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800")}
          >
            Back
          </button>

          <button
            onClick={onApprove}
            className={themeClasses("px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 font-medium")}
          >
            Approve Strategy
          </button>
        </div>
      </div>
    </div>
  )
}
