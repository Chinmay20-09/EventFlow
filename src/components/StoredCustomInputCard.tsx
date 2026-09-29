import type { StoredEvent } from "../api"
import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  record: StoredEvent | null
}

export default function StoredCustomInputCard({ themeClasses, record }: Props) {
  if (!record) return null

  return (
    <section className={themeClasses("mt-6 bg-slate-900 border border-slate-800 rounded-xl p-5")}>
      <h3 className={themeClasses("text-lg font-semibold")}>Stored custom event data</h3>
      <p className={themeClasses("text-sm text-slate-300 mt-2")}>
        #{record.event_id} — {record.name}
      </p>
      <p className={themeClasses("text-xs text-slate-400 mt-1")}>
        Retrieved from the EventFlow backend · {record.status}
      </p>
    </section>
  )
}
