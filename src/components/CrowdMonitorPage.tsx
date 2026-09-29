import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  northGateCrowd: number
  eastZoneCrowd: number
  transitCapacity: number
}

type ZoneRow = [zone: string, level: string, status: string]

const MOVEMENT_ROWS: { label: string; level: string; levelClass: string; barClass: string; barWidth: string }[] = [
  {
    label: "North Gate → Central Zone",
    level: "High flow",
    levelClass: "text-red-400",
    barClass: "bg-red-500",
    barWidth: "w-[85%]",
  },
  {
    label: "Central Zone → East Zone",
    level: "Moderate",
    levelClass: "text-yellow-400",
    barClass: "bg-yellow-500",
    barWidth: "w-[55%]",
  },
  {
    label: "East Zone → Transit",
    level: "Normal",
    levelClass: "text-green-400",
    barClass: "bg-green-500",
    barWidth: "w-[35%]",
  },
]

export default function CrowdMonitorPage({
  themeClasses,
  northGateCrowd,
  eastZoneCrowd,
  transitCapacity,
}: Props) {
  const zones: ZoneRow[] = [
    ["North Gate", `${northGateCrowd}%`, northGateCrowd >= 85 ? "HIGH" : "NORMAL"],
    ["Central Zone", "78%", "HIGH"],
    ["East Zone", `${eastZoneCrowd}%`, "NORMAL"],
    ["Transit", `${transitCapacity}%`, "STABLE"],
  ]

  return (
    <section className={themeClasses("space-y-6")}>
      <div>
        <h3 className={themeClasses("text-2xl font-bold")}>Crowd Monitor</h3>

        <p className={themeClasses("text-slate-400 mt-1")}>
          Monitor crowd density across every event zone.
        </p>
      </div>

      <div className={themeClasses("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4")}>
        {zones.map(([zone, level, status]) => (
          <div
            key={zone}
            className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-5")}
          >
            <p className={themeClasses("text-slate-400 text-sm")}>{zone}</p>

            <p className={themeClasses("text-3xl font-bold mt-2")}>{level}</p>

            <span
              className={`inline-block mt-3 text-xs px-2 py-1 rounded ${
                status === "HIGH" ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
              }`}
            >
              {status}
            </span>
          </div>
        ))}
      </div>

      <div className={themeClasses("bg-slate-900 border border-slate-800 rounded-xl p-6")}>
        <h3 className={themeClasses("text-lg font-semibold")}>Crowd Movement</h3>

        <p className={themeClasses("text-sm text-slate-400 mt-1")}>Current movement between zones</p>

        <div className={themeClasses("mt-6 space-y-5")}>
          {MOVEMENT_ROWS.map((row) => (
            <div key={row.label}>
              <div className={themeClasses("flex justify-between text-sm mb-2")}>
                <span>{row.label}</span>

                <span className={themeClasses(row.levelClass)}>{row.level}</span>
              </div>

              <div className={themeClasses("h-3 bg-slate-800 rounded-full")}>
                <div className={themeClasses(`h-3 ${row.barWidth} ${row.barClass} rounded-full`)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
