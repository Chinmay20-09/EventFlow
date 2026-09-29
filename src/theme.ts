export type ThemeClasses = (classes: string) => string

/**
 * Builds the dashboard's class mapper for the current theme.
 *
 * Dark mode returns the classes unchanged. Light mode rewrites the slate
 * palette to its light equivalent. Either way, colour-changing utilities get a
 * transition so the theme switch animates.
 */
export function createThemeClasses(isDark: boolean): ThemeClasses {
  return (classes: string) => {
    const addThemeTransition = (value: string) =>
      /\b(?:bg|text|border|hover:bg|hover:border)-slate-/.test(value) &&
      !value.includes("transition-colors")
        ? `${value} transition-colors duration-300`
        : value

    if (isDark) {
      return addThemeTransition(classes)
    }

    const lightClasses = classes
      .replace(/\bbg-slate-950\b/g, "bg-slate-100")
      .replace(/\bbg-slate-900\b/g, "bg-white shadow-sm")
      .replace(/\bbg-slate-800\/60\b/g, "bg-slate-50")
      .replace(/\bbg-slate-800\/50\b/g, "bg-slate-50")
      .replace(/\bhover:bg-slate-800\b/g, "hover:bg-slate-100")
      .replace(/\bhover:bg-slate-700\b/g, "hover:bg-slate-200")
      .replace(/\bbg-slate-800\b/g, "bg-slate-50")
      .replace(/\bbg-slate-700\b/g, "bg-slate-200")
      .replace(/\bbg-slate-600\b/g, "bg-slate-400")
      .replace(/\bborder-slate-800\b/g, "border-slate-200")
      .replace(/\bborder-slate-700\b/g, "border-slate-300")
      .replace(/\btext-slate-400\b/g, "text-slate-600")
      .replace(/\btext-slate-300\b/g, "text-slate-700")
      .replace(/\btext-slate-200\b/g, "text-slate-800")

    return addThemeTransition(lightClasses)
  }
}
