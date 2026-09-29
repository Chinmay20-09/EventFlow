import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  selectedStrategy: string | null
  onDismiss: () => void
}

export default function ApprovedNotification({ themeClasses, selectedStrategy, onDismiss }: Props) {
  return (
    <div
      className={themeClasses(
        "fixed bottom-6 right-6 z-[70] bg-green-500/10 border border-green-500/30 rounded-xl p-5 shadow-xl",
      )}
    >
      <p className={themeClasses("text-green-400 font-semibold")}>Strategy approved</p>

      <p className={themeClasses("text-sm text-slate-300 mt-1")}>
        Strategy {selectedStrategy} is now being executed.
      </p>

      <button
        onClick={onDismiss}
        className={themeClasses("text-xs text-slate-400 hover:text-white mt-3")}
      >
        Dismiss
      </button>
    </div>
  )
}
