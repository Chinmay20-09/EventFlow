import { alertsForStrategy } from "./alerts"
import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  selectedStrategy: string | null
}

export default function PredictiveAlerts({ themeClasses, selectedStrategy }: Props) {
  const alerts = alertsForStrategy(selectedStrategy)

  return (
    <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}>
      <h3 className={themeClasses("text-lg font-semibold")}>Predictive Alerts</h3>

      <p className={themeClasses("text-sm text-slate-400 mt-1 mb-5")}>Issues requiring attention</p>

      <div className={themeClasses("space-y-4")}>
        {alerts.map((alert) => (
          <div
            key={alert.title}
            className={themeClasses("border border-slate-800 rounded-lg p-4 space-y-2")}
          >
            <div className={themeClasses("flex justify-between items-start")}>
              <div>
                <p className={themeClasses("text-xs text-blue-400 font-medium")}>{alert.type}</p>

                <h4 className={themeClasses("font-semibold mt-1")}>{alert.title}</h4>
              </div>

              <span
                className={`text-xs px-2 py-1 rounded ${
                  alert.severity === "HIGH"
                    ? "bg-red-500/10 text-red-400"
                    : alert.severity === "MEDIUM"
                    ? "bg-yellow-500/10 text-yellow-400"
                    : "bg-green-500/10 text-green-400"
                }`}
              >
                {alert.severity}
              </span>
            </div>

            <p className={themeClasses("text-sm text-slate-300")}>📍 {alert.location}</p>

            <p className={themeClasses("text-xs text-slate-500")}>🕒 {alert.time}</p>

            <p className={themeClasses("text-sm text-slate-400")}>{alert.description}</p>

            <div className={themeClasses("bg-slate-800 rounded-md p-3")}>
              <p className={themeClasses("text-xs text-green-400 font-medium")}>Recommended Action</p>

              <p className={themeClasses("text-sm mt-1")}>{alert.action}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
