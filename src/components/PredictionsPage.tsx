import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  selectedStrategy: string | null
  onOpenSandbox: () => void
}

type ForecastCard = {
  zone: string
  value: string
  note: string
  valueClass: string
  noteClass: string
}

const FORECAST_CARDS: ForecastCard[] = [
  {
    zone: "North Gate",
    value: "89%",
    note: "+12% expected",
    valueClass: "text-red-400",
    noteClass: "text-red-300",
  },
  {
    zone: "Central Zone",
    value: "74%",
    note: "Moderate density",
    valueClass: "text-yellow-400",
    noteClass: "text-yellow-300",
  },
  {
    zone: "East Zone",
    value: "58%",
    note: "Stable flow",
    valueClass: "text-green-400",
    noteClass: "text-green-300",
  },
  {
    zone: "Transit",
    value: "71%",
    note: "Normal operation",
    valueClass: "text-blue-400",
    noteClass: "text-blue-300",
  },
]

export default function PredictionsPage({ themeClasses, selectedStrategy, onOpenSandbox }: Props) {
  return (
    <div className={themeClasses("space-y-6")}>
      <div>
        <p className={themeClasses("text-blue-400 text-sm font-medium")}>AI CROWD FORECAST</p>
        <h2 className={themeClasses("text-3xl font-bold mt-1")}>Next 60 Minutes Prediction</h2>
        <p className={themeClasses("text-slate-400 mt-2")}>
          Forecasted congestion generated from the EventFlow simulation engine.
        </p>
      </div>

      {/* Forecast Cards */}
      <div className={themeClasses("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4")}>
        {FORECAST_CARDS.map((card) => (
          <div
            key={card.zone}
            className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}
          >
            <p className={themeClasses("text-slate-400 text-sm")}>{card.zone}</p>
            <p className={themeClasses(`text-3xl font-bold mt-2 ${card.valueClass}`)}>{card.value}</p>
            <p className={themeClasses(`text-xs mt-2 ${card.noteClass}`)}>{card.note}</p>
          </div>
        ))}
      </div>

      {/* Forecast Timeline */}
      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>
        <h3 className={themeClasses("text-xl font-semibold mb-5")}>Predicted Crowd Growth</h3>

        <svg viewBox="0 0 600 220" className={themeClasses("w-full h-auto")}>
          <line x1="50" y1="20" x2="50" y2="180" stroke="#475569" strokeWidth="1" />

          <line x1="50" y1="180" x2="560" y2="180" stroke="#475569" strokeWidth="1" />

          <polyline
            fill="none"
            stroke="#ef4444"
            strokeWidth="4"
            points="50,140 140,120 230,90 320,60 410,45 500,35"
          />

          <g fill="#ef4444">
            <circle cx="50" cy="140" r="4" />
            <circle cx="140" cy="120" r="4" />
            <circle cx="230" cy="90" r="4" />
            <circle cx="320" cy="60" r="4" />
            <circle cx="410" cy="45" r="4" />
            <circle cx="500" cy="35" r="4" />
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
          <div className={themeClasses("w-4 h-1 bg-red-500 rounded")} />
          North Gate forecast
        </div>
      </div>

      {/* AI Recommendation */}
      <div className={themeClasses("bg-blue-500/10 border border-blue-500/20 rounded-xl p-5")}>
        <p className={themeClasses("text-blue-300 text-sm font-medium")}>AI RECOMMENDATION</p>

        <h3 className={themeClasses("text-xl font-semibold mt-2")}>
          {selectedStrategy === "A"
            ? "Strategy A successfully reduces congestion"
            : selectedStrategy === "B"
            ? "Additional gate stabilizes entry flow"
            : "Open an additional North Gate within 20 minutes"}
        </h3>

        <button
          onClick={onOpenSandbox}
          className={themeClasses(
            "mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium",
          )}
        >
          Test Response in Sandbox
        </button>

        <p className={themeClasses("text-slate-300 mt-3")}>
          Forecast indicates congestion may exceed 85% between 30–60 minutes. Early intervention is
          expected to reduce peak crowd density.
        </p>
      </div>
    </div>
  )
}
