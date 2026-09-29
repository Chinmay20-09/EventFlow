import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  isDark: boolean
  networkCapacity: number
  selectedStrategy: string | null
  onSelectStrategy: (strategy: string) => void
  onClose: () => void
  onReview: () => void
}

export default function SandboxModal({
  themeClasses,
  isDark,
  networkCapacity,
  selectedStrategy,
  onSelectStrategy,
  onClose,
  onReview,
}: Props) {
  const strategyCardClass = (strategy: string) =>
    `text-left rounded-xl border p-5 transition ${
      selectedStrategy === strategy
        ? "border-blue-500 bg-blue-500/10"
        : isDark
        ? "border-slate-700 bg-slate-800 hover:border-slate-500"
        : "border-slate-300 bg-white shadow-sm hover:border-slate-400"
    }`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sandbox simulation"
      className={themeClasses("fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50")}
    >
      <div
        className={themeClasses(
          "w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-7",
        )}
      >
        {/* Modal Header */}
        <div className={themeClasses("flex items-center justify-between mb-7")}>
          <div>
            <p className={themeClasses("text-blue-400 text-sm font-medium")}>SANDBOX SIMULATION</p>

            <h2 className={themeClasses("text-2xl font-bold mt-1")}>
              Test a response before taking action
            </h2>

            <p className={themeClasses("text-slate-400 text-sm mt-1")}>
              Compare possible strategies against the current event conditions.
            </p>
          </div>

          <button
            onClick={onClose}
            className={themeClasses("text-slate-400 hover:text-white text-2xl")}
          >
            ×
          </button>
        </div>

        {/* Current Situation */}
        <div className={themeClasses("bg-slate-800/60 rounded-xl p-5 mb-6")}>
          <h3 className={themeClasses("font-semibold mb-4")}>Current Situation</h3>

          <div className={themeClasses("grid grid-cols-3 gap-4")}>
            <div>
              <p className={themeClasses("text-sm text-slate-400")}>Crowd Level</p>

              <p className={themeClasses("text-2xl font-bold mt-1")}>
                {selectedStrategy === "A" ? "68%" : selectedStrategy === "B" ? "73%" : "78%"}
              </p>
            </div>

            <div>
              <p className={themeClasses("text-sm text-slate-400")}>North Gate</p>

              <p className={themeClasses("text-2xl font-bold text-red-400 mt-1")}>High</p>
            </div>

            <div>
              <p className={themeClasses("text-sm text-slate-400")}>Network Capacity</p>

              <p className={themeClasses("text-2xl font-bold mt-1")}>{networkCapacity}%</p>
            </div>
          </div>
        </div>

        {/* Strategies */}
        <div className={themeClasses("grid grid-cols-1 lg:grid-cols-2 gap-5")}>
          {/* Strategy A */}
          <button onClick={() => onSelectStrategy("A")} className={strategyCardClass("A")}>
            <div className={themeClasses("flex items-center justify-between")}>
              <h3 className={themeClasses("text-lg font-semibold")}>Strategy A</h3>

              <span className={themeClasses("text-xs px-2 py-1 rounded bg-green-500/10 text-green-400")}>
                LOW RISK
              </span>
            </div>

            <p className={themeClasses("text-slate-300 mt-3")}>
              Redirect crowd from North Gate toward East Zone.
            </p>

            <div className={themeClasses("grid grid-cols-3 gap-3 mt-5")}>
              <div>
                <p className={themeClasses("text-xs text-slate-500")}>Crowd</p>

                <p className={themeClasses("font-semibold")}>68%</p>
              </div>

              <div>
                <p className={themeClasses("text-xs text-slate-500")}>Transit</p>

                <p className={themeClasses("font-semibold")}>72%</p>
              </div>

              <div>
                <p className={themeClasses("text-xs text-slate-500")}>Risk</p>

                <p className={themeClasses("font-semibold text-green-400")}>Low</p>
              </div>
            </div>
          </button>

          {/* Strategy B */}
          <button onClick={() => onSelectStrategy("B")} className={strategyCardClass("B")}>
            <div className={themeClasses("flex items-center justify-between")}>
              <h3 className={themeClasses("text-lg font-semibold")}>Strategy B</h3>

              <span className={themeClasses("text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400")}>
                MEDIUM RISK
              </span>
            </div>

            <p className={themeClasses("text-slate-300 mt-3")}>
              Open additional North Gate access to distribute entry flow.
            </p>

            <div className={themeClasses("grid grid-cols-3 gap-3 mt-5")}>
              <div>
                <p className={themeClasses("text-xs text-slate-500")}>Crowd</p>

                <p className={themeClasses("font-semibold")}>73%</p>
              </div>

              <div>
                <p className={themeClasses("text-xs text-slate-500")}>Transit</p>

                <p className={themeClasses("font-semibold")}>61%</p>
              </div>

              <div>
                <p className={themeClasses("text-xs text-slate-500")}>Risk</p>

                <p className={themeClasses("font-semibold text-yellow-400")}>Medium</p>
              </div>
            </div>
          </button>
        </div>

        {/* Simulation Impact */}
        <div className={themeClasses("mt-6 bg-slate-800/50 border border-slate-700 rounded-xl p-5")}>
          <div className={themeClasses("flex items-center justify-between mb-5")}>
            <div>
              <p className={themeClasses("text-blue-400 text-sm font-medium")}>SIMULATION IMPACT</p>

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
                <p className={themeClasses("text-sm text-slate-400")}>Crowd Level</p>

                <div className={themeClasses("flex items-end gap-3 mt-3")}>
                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>Current</p>

                    <p className={themeClasses("text-xl font-bold")}>
                      {selectedStrategy === "A" ? 68 : selectedStrategy === "B" ? 73 : 78}%
                    </p>
                  </div>

                  <span className={themeClasses("text-slate-500")}>→</span>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>Predicted</p>

                    <p className={themeClasses("text-xl font-bold text-green-400")}>
                      {selectedStrategy === "A" ? "68%" : "73%"}
                    </p>
                  </div>
                </div>

                <div className={themeClasses("mt-4 h-2 bg-slate-700 rounded-full overflow-hidden")}>
                  <div className={themeClasses("h-2 bg-red-400 rounded-full")} style={{ width: "78%" }} />
                </div>

                <div className={themeClasses("mt-2 h-2 bg-slate-700 rounded-full overflow-hidden")}>
                  <div
                    className={themeClasses("h-2 bg-green-400 rounded-full")}
                    style={{ width: selectedStrategy === "A" ? "68%" : "73%" }}
                  />
                </div>
              </div>

              {/* Network */}
              <div className={themeClasses("bg-slate-900 rounded-xl p-4")}>
                <p className={themeClasses("text-sm text-slate-400")}>Network Capacity</p>

                <div className={themeClasses("flex items-end gap-3 mt-3")}>
                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>Current</p>

                    <p className={themeClasses("text-xl font-bold")}>{networkCapacity}%</p>
                  </div>

                  <span className={themeClasses("text-slate-500")}>→</span>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>Predicted</p>

                    <p className={themeClasses("text-xl font-bold text-blue-400")}>
                      {selectedStrategy === "A" ? "72%" : "61%"}
                    </p>
                  </div>
                </div>

                <div className={themeClasses("mt-4 h-2 bg-slate-700 rounded-full overflow-hidden")}>
                  <div className={themeClasses("h-2 bg-slate-500 rounded-full")} style={{ width: "64%" }} />
                </div>

                <div className={themeClasses("mt-2 h-2 bg-slate-700 rounded-full overflow-hidden")}>
                  <div
                    className={themeClasses("h-2 bg-blue-400 rounded-full")}
                    style={{ width: selectedStrategy === "A" ? "72%" : "61%" }}
                  />
                </div>
              </div>

              {/* Risk */}
              <div className={themeClasses("bg-slate-900 rounded-xl p-4")}>
                <p className={themeClasses("text-sm text-slate-400")}>Operational Risk</p>

                <div className={themeClasses("mt-4")}>
                  <p className={themeClasses("text-xs text-slate-500")}>Current</p>

                  <p className={themeClasses("text-xl font-bold text-yellow-400")}>Medium</p>
                </div>

                <div className={themeClasses("flex items-center gap-3 mt-3")}>
                  <span className={themeClasses("text-slate-500")}>→</span>

                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>Predicted</p>

                    <p
                      className={`text-xl font-bold ${
                        selectedStrategy === "A" ? "text-green-400" : "text-yellow-400"
                      }`}
                    >
                      {selectedStrategy === "A" ? "Low" : "Medium"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Crowd Redistribution */}
              <div className={themeClasses("col-span-3 mt-5 border-t border-slate-700 pt-5")}>
                <p className={themeClasses("text-blue-400 text-sm font-medium")}>CROWD REDISTRIBUTION</p>

                <h4 className={themeClasses("text-lg font-semibold mt-1")}>
                  Predicted movement between zones
                </h4>

                {selectedStrategy === "A" ? (
                  <div
                    className={themeClasses(
                      "mt-5 grid grid-cols-1 md:grid-cols-3 items-center gap-4",
                    )}
                  >
                    {/* North Gate */}
                    <div
                      className={themeClasses(
                        "bg-red-500/10 border border-red-500/30 rounded-xl p-5",
                      )}
                    >
                      <p className={themeClasses("text-sm text-slate-400")}>North Gate</p>

                      <p className={themeClasses("text-3xl font-bold text-red-400 mt-2")}>68%</p>

                      <p className={themeClasses("text-xs text-green-400 mt-2")}>↓ Crowd reduced</p>
                    </div>

                    {/* Movement */}
                    <div className={themeClasses("text-center")}>
                      <div className={themeClasses("text-3xl text-blue-400")}>→</div>

                      <p className={themeClasses("text-xs text-slate-400 mt-2")}>
                        Redirecting crowd
                      </p>
                    </div>

                    {/* East Zone */}
                    <div
                      className={themeClasses(
                        "bg-green-500/10 border border-green-500/30 rounded-xl p-5",
                      )}
                    >
                      <p className={themeClasses("text-sm text-slate-400")}>East Zone</p>

                      <p className={themeClasses("text-3xl font-bold text-green-400 mt-2")}>68%</p>

                      <p className={themeClasses("text-xs text-green-400 mt-2")}>↑ Crowd absorbed</p>
                    </div>
                  </div>
                ) : (
                  <div
                    className={themeClasses(
                      "mt-5 bg-slate-900 border border-slate-800 rounded-xl p-5",
                    )}
                  >
                    <p className={themeClasses("text-sm text-slate-400")}>
                      Strategy B increases entry capacity at North Gate rather than redistributing
                      the existing crowd.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className={themeClasses(
                "border border-dashed border-slate-700 rounded-xl p-8 text-center",
              )}
            >
              <p className={themeClasses("text-slate-400")}>
                Select Strategy A or Strategy B above to simulate its impact.
              </p>
            </div>
          )}
        </div>

        {/* Action */}
        <div
          className={themeClasses(
            "flex items-center justify-between mt-7 pt-5 border-t border-slate-800",
          )}
        >
          <p className={themeClasses("text-sm text-slate-400")}>
            {selectedStrategy
              ? `Strategy ${selectedStrategy} selected for review`
              : "Select a strategy to continue"}
          </p>

          <div className={themeClasses("flex gap-3")}>
            <button
              onClick={onClose}
              className={themeClasses("px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800")}
            >
              Cancel
            </button>

            <button
              disabled={!selectedStrategy}
              onClick={onReview}
              className={themeClasses(
                "px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium",
              )}
            >
              Review Strategy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
