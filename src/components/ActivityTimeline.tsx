import type { ThemeClasses } from "../theme"

export type ActivityItem = {
  time: string
  message: string
  type: string
}

type Props = {
  themeClasses: ThemeClasses
  activityLog: ActivityItem[]
}

export default function ActivityTimeline({ themeClasses, activityLog }: Props) {
  return (
    <div className={themeClasses("mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6")}>
      <div className={themeClasses("flex items-center justify-between mb-5")}>
        <div>
          <p className={themeClasses("text-blue-400 text-sm font-medium")}>ACTIVITY</p>

          <h3 className={themeClasses("text-xl font-semibold mt-1")}>Event Timeline</h3>
        </div>

        <span className={themeClasses("text-xs text-slate-500")}>LIVE</span>
      </div>

      <div className={themeClasses("space-y-4")}>
        {activityLog.map((activity, index) => (
          <div key={`${activity.time}-${index}`} className={themeClasses("flex items-start gap-4")}>
            <div
              className={`w-2.5 h-2.5 rounded-full mt-2 ${
                activity.type === "alert"
                  ? "bg-red-400"
                  : activity.type === "success"
                  ? "bg-green-400"
                  : "bg-yellow-400"
              }`}
            />

            <div className={themeClasses("flex-1")}>
              <p className={themeClasses("text-sm text-slate-200")}>{activity.message}</p>

              <p className={themeClasses("text-xs text-slate-500 mt-1")}>{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
