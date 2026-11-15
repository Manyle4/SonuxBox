import { useState } from 'react'
import type { AnalyzeResult } from '../api'
import { describeColumn } from '../describe'
import type { TrackInfo } from '../describe'

interface Props {
  result: AnalyzeResult
  time: number // within this image
  playing: boolean
  info?: TrackInfo
}

// One line saying what's under the playhead right now. Screen readers only hear it
// if you switch announcements on: a new line every beat is a lot to listen to.
export function Caption({ result, time, playing, info }: Props) {
  const [announce, setAnnounce] = useState(false)
  const col = Math.min(Math.floor(time / result.stepSec), result.columns - 1)
  const text = time > 0 && col >= 0 ? describeColumn(result, col, info) : 'Press play, or explore the image slice by slice.'

  return (
    <div className="caption">
      <p aria-live={announce && playing ? 'polite' : 'off'}>
        <span className="now" aria-hidden="true">{playing ? 'Now' : 'Ready'}</span> {text}
      </p>
      <label>
        <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
        Announce while playing
      </label>
    </div>
  )
}
