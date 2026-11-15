import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CODES, codeOfTrack, itemKey, itemLabel, trackByCode, type QItem, type Station } from '../queue'

export interface NowPlaying {
  title: string
  code: string | null // jukebox code, or null for live maps and uploads
  image: string | null
  facts: string // "E dorian · 83 BPM"
  live: boolean
  ready: boolean
  loading: boolean
}

interface Props {
  now: NowPlaying | null
  playing: boolean
  time: number
  duration: number
  currentKey: string | null // the loaded item, to light up its card
  queue: QItem[]
  station: Station | null
  stations: Station[]
  message: string // "Aerosols added to the queue"
  touring: boolean
  onPick: (item: QItem) => void
  onToggle: () => void
  onNext: () => void
  onPrev: () => void
  onSeek: (sec: number) => void
  onPlayAll: () => void
  onShuffle: () => void
  onRemove: (i: number) => void
  onPlayNow: (i: number) => void
  onClear: () => void
  onStation: (id: string) => void
  onTour: () => void
}

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={d} fill="currentColor" /></svg>
)
const PREV = 'M6 5h2v14H6zM20 5.5v13a1 1 0 0 1-1.5.86L9.5 13.7a2 2 0 0 1 0-3.4l9-5.66A1 1 0 0 1 20 5.5Z'
const NEXT = 'M16 5h2v14h-2zM4 5.5v13a1 1 0 0 0 1.5.86l9-5.66a2 2 0 0 0 0-3.4l-9-5.66A1 1 0 0 0 4 5.5Z'
const PLAY = 'M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z'
const PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z'
const LETTERS = [...new Set(CODES.map((c) => c.code[0]))]
const NUMBERS = [...new Set(CODES.map((c) => c.code.slice(1)))]

// The front of the machine: marquee, the record that's playing, the selection cards,
// a keypad for codes, the queue and the live stations. Everything below it is the liner notes.
export function Jukebox(p: Props) {
  const [code, setCode] = useState('')
  const [keyMsg, setKeyMsg] = useState('')
  // The global key listener is set up once, so it reads the latest code and handler from refs.
  const codeRef = useRef('')
  const pickRef = useRef(p.onPick)
  useEffect(() => {
    codeRef.current = code
    pickRef.current = p.onPick
  })

  const press = (k: string) => {
    if (LETTERS.includes(k)) {
      codeRef.current = k
      setCode(k)
      setKeyMsg('')
      return
    }
    const letter = codeRef.current[0]
    if (!letter) return setKeyMsg('Pick a letter first')
    const track = trackByCode(letter + k)
    codeRef.current = ''
    setCode('')
    if (!track) return setKeyMsg(`No record at ${letter}${k}`)
    setKeyMsg('')
    pickRef.current({ kind: 'track', id: track.id })
  }

  // Type a code anywhere on the page: B then 3.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable) return
      const k = e.key.toUpperCase()
      if (LETTERS.includes(k) || (NUMBERS.includes(k) && codeRef.current)) {
        e.preventDefault()
        press(k)
      } else if (e.key === 'Escape' && codeRef.current) setCode('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { now, playing, time, duration } = p
  const progress = duration > 0 ? Math.min(time / duration, 1) : 0
  // Needle: on the record only while it plays, from the outer groove (-6°) to near the
  // label (18°); lifted back to its rest when paused or stopped. Angles measured so it
  // stays on the grooves at both record sizes (230 px desktop, 190 px phone).
  const arm = playing ? -6 + progress * 24 : -28
  const queued = new Map<string, number>()
  p.queue.forEach((q, i) => { if (!queued.has(itemKey(q))) queued.set(itemKey(q), i + 1) })

  return (
    <section className="jukebox" aria-label="Jukebox">
      <div className="jb-marquee">
        <div className="jb-tubes" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
        </div>
        <h1 className="jb-title">Sonux<span>Box</span></h1>
        <p className="jb-sub">The Earth jukebox · pick a record, hear the planet</p>
        <div className={`jb-bulbs${playing ? ' chase' : ''}`} aria-hidden="true">
          {Array.from({ length: 15 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
        </div>
      </div>

      <div className="jb-deck">
        <div className="jb-turntable">
          <div className={`jb-record${playing ? ' spinning' : ''}${now?.image ? '' : ' blank'}`} aria-hidden="true">
            {now?.image && <div className="jb-art" style={{ backgroundImage: `url(${now.image})` }} />}
            <div className="jb-grooves" />
            <div className="jb-label">
              <span>{now?.code ?? (now?.live ? 'LIVE' : now ? '♪' : '')}</span>
            </div>
          </div>
          <svg className="jb-arm" viewBox="0 0 60 150" style={{ '--arm': `${arm}deg` } as CSSProperties} aria-hidden="true">
            <circle cx="30" cy="16" r="13" className="pivot" />
            <path d="M30 16 L30 112 L22 134" className="tube" />
            <rect x="14" y="128" width="16" height="12" rx="2" transform="rotate(18 22 134)" className="head" />
          </svg>
        </div>

        <div className="jb-now">
          <p className="jb-eyebrow">{now ? (now.loading ? 'Cueing up' : 'Now playing') : 'Ready when you are'}</p>
          <h2 className="jb-np-title">{now?.title ?? 'Pick a record'}</h2>
          <p className="jb-facts">
            {now ? (now.loading ? 'Reading the image…' : now.facts) : 'Tap a card, type a code like B1, or tune into a live station.'}
          </p>
          <input className="jb-seek" type="range" min={0} max={Math.max(duration, 0.01)} step={0.1} value={Math.min(time, duration)}
            onChange={(e) => p.onSeek(Number(e.target.value))} disabled={!now?.ready} aria-label="Position"
            aria-valuetext={`${clock(time)} of ${clock(duration)}`} style={{ '--pct': `${progress * 100}%` } as CSSProperties} />
          <div className="jb-transport">
            <button className="jb-btn" onClick={p.onPrev} aria-label="Previous or restart" disabled={!now}>
              <Icon d={PREV} />
            </button>
            <button className="jb-btn jb-play" onClick={p.onToggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!now?.ready}>
              <Icon d={playing ? PAUSE : PLAY} />
            </button>
            <button className="jb-btn" onClick={p.onNext} aria-label="Next" disabled={!p.queue.length && !p.station}>
              <Icon d={NEXT} />
            </button>
            <span className="jb-clock">{clock(time)} / {clock(duration)}</span>
          </div>
          <div className="jb-actions">
            <button className="jb-chip" onClick={p.onPlayAll}>Play all</button>
            <button className="jb-chip" onClick={p.onShuffle}>Shuffle</button>
            {!p.touring && <button className="jb-chip lit" onClick={p.onTour}>Guided tour · 2½ min</button>}
          </div>
        </div>
      </div>

      <div className="jb-body">
        <div className="jb-panel">
          <h2 className="jb-h">Selections</h2>
          <ul className="jb-cards">
            {CODES.map(({ code: c, track }) => {
              const key = itemKey({ kind: 'track', id: track.id })
              const on = p.currentKey === key
              const pos = queued.get(key)
              return (
                <li key={c}>
                  <button className={`jb-card${on ? ' on' : ''}`} onClick={() => p.onPick({ kind: 'track', id: track.id })}
                    aria-label={`${c}, ${track.title}${on ? (playing ? ', playing' : ', loaded') : ''}${pos ? `, number ${pos} in the queue` : ''}`}>
                    <span className="jb-code">{c}</span>
                    <span className="jb-card-title">{track.title}</span>
                    {track.frames && <span className="jb-tag">Time-lapse</span>}
                    {pos && <span className="jb-pos" aria-hidden="true">{pos}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="jb-side">
          <div className="jb-panel">
            <h2 className="jb-h">Type a code</h2>
            <div className="jb-display" aria-hidden="true">{code[0] ?? '–'} {code[1] ?? '–'}</div>
            <div className="jb-keys" role="group" aria-label="Keypad: a letter, then a number">
              {LETTERS.map((k) => <button key={k} className={`jb-key${code === k ? ' on' : ''}`} onClick={() => press(k)}>{k}</button>)}
              {NUMBERS.map((k) => <button key={k} className="jb-key num" onClick={() => press(k)}>{k}</button>)}
            </div>
            <p className="jb-hint" aria-live="polite">{keyMsg || p.message || 'Your keyboard works too.'}</p>
          </div>

          <div className="jb-panel">
            <h2 className="jb-h">
              {p.station ? <>Station · {p.station.title}</> : 'Up next'}
              {(p.queue.length > 0 || p.station) && <button className="jb-link" onClick={p.onClear}>{p.station ? 'Stop station' : 'Clear'}</button>}
            </h2>
            {p.queue.length ? (
              <ol className="jb-queue">
                {p.queue.slice(0, 6).map((q, i) => (
                  <li key={`${itemKey(q)}-${i}`}>
                    <span className="jb-code small">{q.kind === 'track' ? codeOfTrack(q.id) : 'LIVE'}</span>
                    <span className="jb-q-title">{itemLabel(q)}</span>
                    <button className="jb-x" onClick={() => p.onPlayNow(i)} aria-label={`Play ${itemLabel(q)} now`}>▶</button>
                    <button className="jb-x" onClick={() => p.onRemove(i)} aria-label={`Remove ${itemLabel(q)} from the queue`}>×</button>
                  </li>
                ))}
                {p.queue.length > 6 && <li className="jb-more">and {p.queue.length - 6} more</li>}
              </ol>
            ) : (
              <p className="jb-hint">{p.station ? 'Tuning the next day…' : 'Pick more records and they’ll play in turn.'}</p>
            )}
          </div>
        </div>
      </div>

      <div className="jb-panel jb-stations-panel">
        <h2 className="jb-h">Stations <span className="jb-live">Live NASA data, always on</span></h2>
        <ul className="jb-stations">
          {p.stations.map((s) => (
            <li key={s.id}>
              <button className={`jb-station${p.station?.id === s.id ? ' on' : ''}`} onClick={() => p.onStation(s.id)}
                aria-pressed={p.station?.id === s.id}>
                <span className="jb-dial" aria-hidden="true" />
                <b>{s.title}</b>
                <span>{s.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
