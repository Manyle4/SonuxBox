import { useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import type { AnalyzeResult } from '../api'
import { columnInfo, describeColumn } from '../describe'
import { playColumn } from '../explore'

interface Props {
  imageUrl: string
  imageAlt: string
  result: AnalyzeResult | null
  time: number
  playing: boolean
  onSeek: (sec: number) => void
}

// The image with a playhead sweeping left to right, one column per eighth note.
// It's also a slider: hover, drag or use the arrow keys to hear one slice at a time.
export function MapView({ imageUrl, imageAlt, result, time, playing, onSeek }: Props) {
  const [explore, setExplore] = useState<number | null>(null)

  const gridSec = result ? result.columns * result.stepSec : 0
  const progress = gridSec > 0 ? Math.min(time / gridSec, 1) : 0
  const col = result && time > 0 && time < gridSec ? Math.floor(time / result.stepSec) : -1
  const mapShare = result ? 1 - result.cropBottom : 1 // the legend strip isn't heard
  const maxLand = result ? Math.max(...result.columnStats.map((c) => c.land), 1e-6) : 1

  const colAt = (clientX: number, box: DOMRect) =>
    result ? Math.min(Math.max(Math.floor(((clientX - box.left) / box.width) * result.columns), 0), result.columns - 1) : 0

  const goTo = (c: number) => {
    if (!result) return
    setExplore(c)
    if (playing) onSeek(c * result.stepSec)
    else playColumn(columnInfo(result, c))
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!result || playing) return
    if (e.pointerType !== 'mouse' && e.buttons === 0) return // touch: only while dragging
    const c = colAt(e.clientX, e.currentTarget.getBoundingClientRect())
    if (c !== explore) goTo(c)
  }

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!result) return
    const box = e.currentTarget.getBoundingClientRect()
    onSeek(((e.clientX - box.left) / box.width) * gridSec)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!result) return
    const from = explore ?? Math.max(col, 0)
    const last = result.columns - 1
    const next = { ArrowRight: from + 1, ArrowLeft: from - 1, Home: 0, End: last }[e.key]
    if (next !== undefined) {
      e.preventDefault()
      goTo(Math.min(Math.max(next, 0), last))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSeek(from * result.stepSec) // play from here
    }
  }

  const shown = explore ?? Math.max(col, 0)
  const showExplore = explore !== null && !playing

  return (
    <div className="mapview">
      <div
        className="map"
        onClick={onClick}
        onPointerMove={onMove}
        onPointerLeave={() => setExplore(null)}
        onKeyDown={onKey}
        onBlur={() => setExplore(null)}
        {...(result && {
          role: 'slider',
          tabIndex: 0,
          'aria-label': 'Explore the image slice by slice. Arrow keys move, Enter plays from here.',
          'aria-valuemin': 1,
          'aria-valuemax': result.columns,
          'aria-valuenow': shown + 1,
          'aria-valuetext': describeColumn(result, shown),
        })}
      >
        <img src={imageUrl} alt={imageAlt} />
        {result && (
          <>
            <div className="ignored" style={{ height: `${result.cropBottom * 100}%` }} title="Legend area: not heard" />
            {col >= 0 && (
              <div className="band" style={{ left: `${(col / result.columns) * 100}%`, width: `${100 / result.columns}%`, height: `${mapShare * 100}%` }} />
            )}
            {showExplore && (
              <div className="band explore" style={{ left: `${(explore / result.columns) * 100}%`, width: `${100 / result.columns}%`, height: `${mapShare * 100}%` }} />
            )}
            {time > 0 && <div className="playhead" style={{ left: `${progress * 100}%`, height: `${mapShare * 100}%` }} />}
          </>
        )}
      </div>
      {result && (
        <div className="strength" onClick={onClick} aria-hidden="true">
          {result.columnStats.map((c, i) => (
            <div
              key={i}
              className={i === col ? 'on' : showExplore && i === explore ? 'explore' : ''}
              style={{ height: `${Math.max((c.land / maxLand) * 100, 4)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
