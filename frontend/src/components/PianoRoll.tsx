import type { MouseEvent } from 'react'
import type { AnalyzeResult } from '../api'

interface Props {
  result: AnalyzeResult
  time: number
  onSeek: (sec: number) => void
}

const W = 1000
const H = 220

export function PianoRoll({ result, time, onSeek }: Props) {
  const total = Math.max(result.musicSec, result.columns * result.stepSec)
  const midis = result.notes.map((n) => n.midi)
  const lo = Math.min(...midis) - 1
  const hi = Math.max(...midis) + 1
  const rowH = H / (hi - lo + 1)
  const x = (sec: number) => (sec / total) * W

  // Draw pad first and melody last, so the melody sits on top.
  const order = { pad: 0, bass: 1, melody: 2 }
  const notes = [...result.notes].sort((a, b) => order[a.voice] - order[b.voice])

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
              className={`note ${n.voice}${active ? ' active' : ''}`}
              x={x(n.start)}
              y={(hi - n.midi) * rowH + 1}
              width={Math.max(x(n.dur) - 1.5, 2)}
              height={Math.max(rowH - 2, 2)}
              rx={2}
              opacity={0.35 + 0.65 * n.vel}
            />
          )
        })}
        {time > 0 && (
          <line className="rollhead" x1={x(time)} x2={x(time)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <figcaption>
        <span className="key melody">Melody</span>
        <span className="key bass">Bass</span>
        <span className="key pad">Pad</span>
      </figcaption>
    </figure>
  )
}
