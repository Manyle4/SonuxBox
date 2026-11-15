import type { AnalyzeResult } from '../api'

interface Props {
  result: AnalyzeResult
  playing: boolean
  time: number
  duration: number
  onToggle: () => void
  onDownload: () => void | Promise<void>
}

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function PlayerBar({ result, playing, time, duration, onToggle, onDownload }: Props) {
  return (
    <div className="playerbar">
      <button className="play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
          </svg>
        )}
      </button>
      <span className="clock">
        {clock(time)} / {clock(duration)}
      </span>
      <ul className="facts">
        <li><b>{result.scale}</b></li>
        <li>{Math.round(result.bpm)} BPM</li>
        <li>{result.notes.filter((n) => n.voice !== 'perc').length} notes</li>
        <li>{result.analysisMode}</li>
      </ul>
      <button className="download" onClick={onDownload}>
        Download WAV
      </button>
    </div>
  )
}
