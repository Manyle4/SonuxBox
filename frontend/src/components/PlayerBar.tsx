import { useEffect, useRef, useState } from 'react'
import type { AnalyzeResult } from '../api'

interface Props {
  result: AnalyzeResult
  playing: boolean
  time: number
  duration: number
  onToggle: () => void
  onDownload: () => void | Promise<void>
  title: string
}

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const PlayIcon = ({ playing }: { playing: boolean }) =>
  playing ? (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
    </svg>
  )

export function PlayerBar({ result, playing, time, duration, onToggle, onDownload, title }: Props) {
  // Once the bar scrolls off screen, a small copy sits at the bottom so play/pause stays in reach.
  const ref = useRef<HTMLDivElement>(null)
  const [away, setAway] = useState(false)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try { await onDownload() } finally { setSaving(false) }
  }
  // Shown when neither this bar nor the jukebox's controls are on screen.
  useEffect(() => {
    const els = [ref.current, document.querySelector('.jb-transport')].filter((e): e is Element => !!e)
    const seen = new Map<Element, boolean>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting)
      setAway(els.every((el) => seen.get(el) === false))
    })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="playerbar" ref={ref}>
      <button className="play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
        <PlayIcon playing={playing} />
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
      <button className="download" onClick={save} disabled={saving} aria-busy={saving}>
        {saving ? 'Preparing WAV…' : 'Download WAV'}
      </button>
      {away && (
        <div className="miniplayer" role="region" aria-label="Mini player">
          <button className="play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
            <PlayIcon playing={playing} />
          </button>
          <span className="mini-title">{title}</span>
          <span className="clock">{clock(time)} / {clock(duration)}</span>
          <progress max={duration || 1} value={time} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
