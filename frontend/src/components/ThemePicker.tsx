import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'contrast'
const LABELS: Record<Theme, string> = { dark: 'Dark', light: 'Light', contrast: 'High contrast' }

// First visit follows the system (light mode, "increase contrast"); after that, your pick is remembered.
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('sonux-theme')
    if (saved === 'dark' || saved === 'light' || saved === 'contrast') return saved
  } catch {
    // storage blocked: fall through to the system setting
  }
  if (matchMedia('(prefers-contrast: more)').matches) return 'contrast'
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('sonux-theme', theme)
    } catch {
      // fine: it just won't be remembered
    }
  }, [theme])

  return (
    <span className="theme" role="group" aria-label="Colour theme">
      {(Object.keys(LABELS) as Theme[]).map((t) => (
        <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
          {LABELS[t]}
        </button>
      ))}
    </span>
  )
}
