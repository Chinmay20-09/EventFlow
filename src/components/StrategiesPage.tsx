import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  onOpenSandbox: () => void
}

type StrategyCard = {
  title: string
  risk: string
  riskClass: string
  summary: string
}

const STRATEGY_CARDS: StrategyCard[] = [
  {
    title: "Redirect Crowd",
    risk: "LOW RISK",
    riskClass: "text-green-400",
    summary: "Redirect incoming crowd from North Gate toward East Zone.",
  },
  {
    title: "Open Additional Gate",
    risk: "MEDIUM RISK",
    riskClass: "text-yellow-400",
    summary: "Increase entry capacity by opening an additional access point.",
  },
]

export default function StrategiesPage({ themeClasses, onOpenSandbox }: Props) {
  return (
    <section className={themeClasses("space-y-6")}>
      <div>
        <h3 className={themeClasses("text-2xl font-bold")}>Strategies</h3>

        <p className={themeClasses("text-slate-400 mt-1")}>Available operational responses.</p>
      </div>

      <div className={themeClasses("grid grid-cols-1 lg:grid-cols-2 gap-5")}>
        {STRATEGY_CARDS.map((card) => (
          <div
            key={card.title}
            className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}
          >
            <div className={themeClasses("flex justify-between")}>
              <h3 className={themeClasses("text-lg font-semibold")}>{card.title}</h3>

              <span className={themeClasses(`text-xs ${card.riskClass}`)}>{card.risk}</span>
            </div>

            <p className={themeClasses("text-slate-400 text-sm mt-3")}>{card.summary}</p>

            <button
              onClick={onOpenSandbox}
              className={themeClasses(
                "mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium",
              )}
            >
              Test Strategy
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
