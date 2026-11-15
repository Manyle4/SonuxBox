import type { MouseEvent } from 'react'
import type { AnalyzeResult, Voice } from '../api'
import { layerName, type TrackInfo } from '../describe'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

interface Props {
  result: AnalyzeResult
  time: number
  onSeek: (sec: number) => void
  muted?: Set<Voice>
  marks?: { at: number; label: string }[] // frame starts in a time-lapse
  info?: TrackInfo
}

const W = 1000
const H = 220

export function PianoRoll({ result, time, onSeek, muted, marks = [], info }: Props) {
  const total = Math.max(result.musicSec, result.columns * result.stepSec)
  const pitched = result.notes.filter((n) => n.voice !== 'perc')
  const hits = result.notes.filter((n) => n.voice === 'perc')
  const drumH = hits.length ? 18 : 0 // a lane along the bottom for drum hits
  const midis = pitched.map((n) => n.midi)
  const lo = Math.min(...midis) - 1
  const hi = Math.max(...midis) + 1
  const rowH = (H - drumH) / (hi - lo + 1)
  const x = (sec: number) => (sec / total) * W

  // Draw pad first and melody last, so the melody sits on top.
  const order: Record<string, number> = { pad: 0, bass: 1, pluck: 2, bell: 3, melody: 4 }
  const notes = [...pitched].sort((a, b) => order[a.voice] - order[b.voice])
  // Colour layers draw in their own colour.
  const layerFill = Object.fromEntries((result.layers ?? []).map((l) => [l.voice, l.hex]))

  const seekFromClick = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    onSeek(((e.clientX - box.left) / box.width) * total)
  }

  return (
    <figure className="roll">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={seekFromClick} role="img"
        aria-label={`Piano roll: ${result.notes.length} notes`}>
        {Array.from({ length: result.columns / 4 + 1 }, (_, bar) => (
          <line key={bar} className="barline" x1={x(bar * 4 * result.stepSec)} x2={x(bar * 4 * result.stepSec)}
            y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        ))}
        {notes.map((n, i) => {
          const active = time > 0 && time >= n.start && time < n.start + n.dur
          return (
            <rect
              key={i}
              className={`note ${n.voice}${active ? ' active' : ''}${muted?.has(n.voice) ? ' muted' : ''}`}
              x={x(n.start)}
              y={(hi - n.midi) * rowH + 1}
              width={Math.max(x(n.dur) - 1.5, 2)}
              height={Math.max(rowH - 2, 2)}
              rx={2}
              opacity={0.35 + 0.65 * n.vel}
              style={layerFill[n.voice] && !active ? { fill: layerFill[n.voice] } : undefined}
              {...(layerFill[n.voice] && { stroke: 'rgba(255,255,255,0.55)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' })}
            />
          )
        })}
        {hits.map((n, i) => {
          const active = time > 0 && time >= n.start && time < n.start + Math.max(n.dur, 0.15)
          return (
            <rect key={`h${i}`} className={`note perc${active ? ' active' : ''}${muted?.has('perc') ? ' muted' : ''}`} x={x(n.start)} y={H - drumH + 3}
              width={6} height={drumH - 6} rx={2} opacity={0.4 + 0.6 * n.vel} />
          )
        })}
        {marks.map((m) => (
          <line key={m.label} className="framemark" x1={x(m.at)} x2={x(m.at)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        ))}
        {time > 0 && (
          <line className="rollhead" x1={x(time)} x2={x(time)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {marks.map((m) => (
        <span key={m.label} className="framelabel" style={{ left: `${(m.at / total) * 100}%` }} aria-hidden="true">
          {m.label}
        </span>
      ))}
      <figcaption>
        <span className="key melody">Melody</span>
        <span className="key bass">Bass</span>
        <span className="key pad">Pad</span>
        {hits.length > 0 && <span className="key perc">Drums</span>}
        {(result.layers ?? []).filter((l) => result.notes.some((n) => n.voice === l.voice)).map((l) => (
          <span key={l.voice} className="key layerkey" style={{ '--swatch': l.hex } as React.CSSProperties}>
            {cap(layerName(l, info))} ({l.voice})
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
