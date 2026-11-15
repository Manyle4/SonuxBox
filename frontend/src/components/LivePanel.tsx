import { useState } from 'react'
import { daysAgo, LIVE_LAYERS, yearBefore } from '../live'

interface Props {
  onPlay: (layer: string, date: string, then?: string) => void
  busy: boolean
  error?: string | null
  disabled?: boolean
}

// Pick a NASA layer and a day; optionally an earlier day to hear the change.
export function LivePanel({ onPlay, busy, error, disabled }: Props) {
  const [layerId, setLayerId] = useState(LIVE_LAYERS[0].id)
  const layer = LIVE_LAYERS.find((l) => l.id === layerId)!
  const [date, setDate] = useState(daysAgo(LIVE_LAYERS[0].lagDays))
  const [compare, setCompare] = useState(false)
  const [then, setThen] = useState(yearBefore(date))
  const today = daysAgo(0)

  const pickLayer = (id: string) => {
    const l = LIVE_LAYERS.find((x) => x.id === id)!
    setLayerId(id)
    // Keep the chosen day inside what the layer has.
    if (date < l.start) setDate(daysAgo(l.lagDays))
    if (then < l.start) setThen(l.start)
  }

  const okThen = !compare || (then >= layer.start && then < date)
  return (
    <form
      className="live"
      onSubmit={(e) => {
        e.preventDefault()
        if (okThen) onPlay(layerId, date, compare ? then : undefined)
      }}
    >
      <p className="hint">Daily maps of the whole planet from NASA's GIBS, the imagery behind Worldview.</p>
      <label>
        <span>Layer</span>
        <select value={layerId} onChange={(e) => pickLayer(e.target.value)} disabled={disabled}>
          {LIVE_LAYERS.map((l) => (
            <option key={l.id} value={l.id}>{l.title}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Day</span>
        <input type="date" value={date} min={layer.start} max={today} required disabled={disabled}
          onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} disabled={disabled} />
        Play an earlier day first, to hear the change
      </label>
      {compare && (
        <label>
          <span>Earlier day</span>
          <input type="date" value={then} min={layer.start} max={date} required disabled={disabled}
            aria-invalid={!okThen} onChange={(e) => e.target.value && setThen(e.target.value)} />
        </label>
      )}
      <button type="submit" className="primary" disabled={disabled || busy || !okThen}>
        {busy ? 'Fetching from NASA…' : compare ? '▶ Play the change' : '▶ Play this day'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="hint small">The newest day or two may not be ready yet.</p>
    </form>
  )
}
