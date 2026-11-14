import type { MouseEvent } from 'react'
import type { AnalyzeResult } from '../api'

interface Props {
  imageUrl: string
  result: AnalyzeResult | null
  time: number
  onSeek: (sec: number) => void
}

// The image with a playhead sweeping left to right, one column per eighth note.
export function MapView({ imageUrl, result, time, onSeek }: Props) {
  const gridSec = result ? result.columns * result.stepSec : 0
  const progress = gridSec > 0 ? Math.min(time / gridSec, 1) : 0
  const col = result && time > 0 && time < gridSec ? Math.floor(time / result.stepSec) : -1
  const mapShare = result ? 1 - result.cropBottom : 1 // the legend strip isn't heard

  const maxLand = result ? Math.max(...result.columnStats.map((c) => c.land), 1e-6) : 1

  const seekFromClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!result) return
    const box = e.currentTarget.getBoundingClientRect()
    onSeek(((e.clientX - box.left) / box.width) * gridSec)
  }

  return (
    <div className="mapview">
      <div className="map" onClick={seekFromClick}>
        <img src={imageUrl} alt="Uploaded map" />
        {result && (
          <>
            <div className="ignored" style={{ height: `${result.cropBottom * 100}%` }} title="Legend area: not heard" />
            {col >= 0 && (
              <div
                className="band"
                style={{
                  left: `${(col / result.columns) * 100}%`,
                  width: `${100 / result.columns}%`,
                  height: `${mapShare * 100}%`,
                }}
              />
            )}
            {time > 0 && <div className="playhead" style={{ left: `${progress * 100}%`, height: `${mapShare * 100}%` }} />}
          </>
        )}
      </div>
      {result && (
        <div className="strength" onClick={seekFromClick} aria-hidden="true">
          {result.columnStats.map((c, i) => (
            <div
              key={i}
              className={i === col ? 'on' : ''}
              style={{ height: `${Math.max((c.land / maxLand) * 100, 4)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
