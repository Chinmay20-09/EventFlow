# PHASE 9 — Design System

> Status: **COMPLETE** · One design system, taken wholesale from `ideal/`. Nothing to reconcile because `frontend/` ships the identical CSS and identical `components/ui/*` (verified: 0 whitespace-insensitive diff lines across all 68 UI files and `globals.css`).

## 1. Stack

| Layer | Choice | Files |
|---|---|---|
| CSS framework | Tailwind CSS v4 (PostCSS) + `tw-animate-css` | `postcss.config.mjs`, `app/globals.css` |
| Component primitives | shadcn-style components on `radix-ui` + `@base-ui/react` | `components/ui/*` (68 files), `components.json` |
| Icons | `lucide-react` | throughout `app/*.tsx` |
| Charts | `recharts` (available via ui/chart) | `components/ui/chart.tsx` |
| Overlays | `vaul` (drawers), `sonner` (toasts), `cmdk` (command menu) | `components/ui/*` |
| Forms | `react-hook-form` + `zod` | `components/ui/form.tsx` |
| Theming | `next-themes`, class-based dark mode | `app/theme-provider.tsx`, `.dark` CSS vars |
| Fonts | system/Arial stack declared in globals.css (`font-family:Arial,Helvetica,sans-serif`) | `app/globals.css` |

## 2. Tokens

`:root` / `.dark` CSS variables in `app/globals.css`:
`--background #fff / #152132`, `--foreground #16283f / #edf3fb`, `--primary #2266e5`, `--panel`, `--muted`, `--border`, `--secondary`, `--ring`, `--radius .75rem` — mapped into Tailwind via `@theme inline`.

All component styling uses the hand-written semantic classes in `globals.css` (`.brand`, `.workspace`, `.panel`, `.eyebrow`, `.ops-card`, `.strategy-grid`, `.summary-metrics`, `.event-sidebar`, `.map-wrap`, …) — identical file in all three projects, including responsive breakpoints (760px, 580px, 1100px, 800px, 420px), mobile bottom-sheet panel, mobile bottom nav bar, and the `phase-map` full-bleed map layout.

## 3. Conflicts found

None. `frontend/` does not introduce a second styling system (its vinext wrapper uses the same Tailwind v4 + shadcn setup; its `src/`-era Vite app at the repo root is a different, non-migrated app).

## 4. Asset/font/icon resolution checklist

- Icons: `lucide-react` imported directly — no network dependency. ✅
- Fonts: system stack — no webfont loading. ✅
- Static assets: `public/favicon.svg` referenced in `layout.tsx` metadata — present in `frontend-ideal/public/`. ✅
- Dark/light theme: `next-themes` with `suppressHydrationWarning`, class attribute on `<html>`; verified identical `theme-provider.tsx`. ✅
- Tailwind content scanning: v4 auto-detects; `postcss.config.mjs` identical. ✅
