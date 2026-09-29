import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  isDark: boolean
  eventName: string
  onEventNameChange: (value: string) => void
  maxCapacity: number
  onMaxCapacityChange: (value: number) => void
  alertThreshold: number
  onAlertThresholdChange: (value: number) => void
  autoAlerts: boolean
  onToggleAutoAlerts: () => void
}

export default function SettingsPage({
  themeClasses,
  isDark,
  eventName,
  onEventNameChange,
  maxCapacity,
  onMaxCapacityChange,
  alertThreshold,
  onAlertThresholdChange,
  autoAlerts,
  onToggleAutoAlerts,
}: Props) {
  const inputClass = themeClasses(
    "w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500",
  )

  return (
    <section className={themeClasses("space-y-6")}>
      <div>
        <p className={themeClasses("text-blue-400 text-sm font-medium")}>ORGANIZER SETTINGS</p>

        <h2 className={themeClasses("text-3xl font-bold mt-1")}>System Configuration</h2>

        <p className={themeClasses("text-slate-400 mt-2")}>
          Configure event parameters and alert behavior.
        </p>
      </div>

      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5")}>
        <div>
          <label className={themeClasses("block text-sm text-slate-400 mb-2")}>Event Name</label>

          <input
            value={eventName}
            onChange={(e) => onEventNameChange(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={themeClasses("block text-sm text-slate-400 mb-2")}>Maximum Capacity</label>

          <input
            type="number"
            value={maxCapacity}
            onChange={(e) => onMaxCapacityChange(Number(e.target.value))}
            className={inputClass}
          />
        </div>

        <div>
          <label className={themeClasses("block text-sm text-slate-400 mb-2")}>
            Alert Threshold ({alertThreshold}%)
          </label>

          <input
            type="range"
            min="60"
            max="100"
            value={alertThreshold}
            onChange={(e) => onAlertThresholdChange(Number(e.target.value))}
            className={themeClasses("w-full")}
          />
        </div>

        <div className={themeClasses("flex items-center justify-between bg-slate-800 rounded-lg p-4")}>
          <div>
            <p className={themeClasses("font-medium")}>Auto AI Alerts</p>

            <p className={themeClasses("text-sm text-slate-400")}>
              Automatically generate predictive warnings
            </p>
          </div>

          <button
            onClick={onToggleAutoAlerts}
            className={`w-14 h-8 rounded-full transition ${
              autoAlerts ? "bg-blue-600" : isDark ? "bg-slate-600" : "bg-slate-300"
            }`}
          >
            <div
              className={`w-6 h-6 bg-white rounded-full transition transform ${
                autoAlerts ? "translate-x-7" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <button className={themeClasses("w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium")}>
          Save Settings
        </button>
      </div>
    </section>
  )
}
