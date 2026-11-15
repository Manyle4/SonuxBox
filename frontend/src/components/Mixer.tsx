import type { Layer, Voice } from '../api'

interface Props {
  muted: Set<Voice>
  onToggle: (v: Voice) => void
  rate: number
  onRate: (r: number) => void
  hasPerc: boolean
  layers: Layer[] // colour layers that actually play
  reverb: boolean
  onReverb: () => void
}

const LAYERS: { id: Voice; label: string }[] = [
  { id: 'melody', label: 'Melody' },
  { id: 'bass', label: 'Bass' },
  { id: 'pad', label: 'Pad' },
  { id: 'perc', label: 'Drums' },
]
const RATES = [0.75, 1, 1.25, 1.5]

// Live controls: switch layers on/off and change the speed.
export function Mixer({ muted, onToggle, rate, onRate, hasPerc, layers, reverb, onReverb }: Props) {
  return (
    <div className="mixer">
      <div className="group" role="group" aria-label="Layers">
        <span className="label">Layers</span>
        {[
          ...LAYERS.filter((l) => l.id !== 'perc' || hasPerc),
          ...layers.map((l) => ({ id: l.voice as Voice, label: `${l.color[0].toUpperCase()}${l.color.slice(1)} (${l.voice})`, hex: l.hex })),
        ].map((l) => (
          <button
            key={l.id}
            className={`layer ${l.id}${muted.has(l.id) ? ' off' : ''}`}
            style={'hex' in l ? ({ '--swatch': l.hex } as React.CSSProperties) : undefined}
            aria-pressed={!muted.has(l.id)}
            onClick={() => onToggle(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="group">
        <button className={`rate${reverb ? ' on' : ''}`} aria-pressed={reverb} onClick={onReverb}>
          Reverb
        </button>
      </div>
      <div className="group" role="group" aria-label="Speed">
        <span className="label">Speed</span>
        {RATES.map((r) => (
          <button key={r} className={`rate${r === rate ? ' on' : ''}`} aria-pressed={r === rate} onClick={() => onRate(r)}>
            {r}×
          </button>
        ))}
      </div>
    </div>
  )
}
