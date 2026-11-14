import type { AnalysisMode } from '../api'

interface Props {
  mode: AnalysisMode
  onChange: (mode: AnalysisMode) => void
  disabled?: boolean
}

const MODES: { id: AnalysisMode; label: string; hint: string }[] = [
  { id: 'adaptive', label: 'Adaptive', hint: 'Best for data maps: learns the colours of each image' },
  { id: 'terrain', label: 'Terrain', hint: 'Best for real-colour Earth photos: ocean, land, ice' },
]

export function ModeToggle({ mode, onChange, disabled }: Props) {
  const current = MODES.find((m) => m.id === mode)
  return (
    <div className="mode">
      <div className="segmented" role="radiogroup" aria-label="Analysis mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            className={mode === m.id ? 'on' : ''}
            onClick={() => onChange(m.id)}
            disabled={disabled}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="hint">{current?.hint}</p>
    </div>
  )
}
