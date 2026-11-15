import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyze, API_URL, atSpeed, MAX_UPLOAD_BYTES, type AnalysisMode, type AnalyzeResult, type Voice } from './api'
import { useAudioEngine } from './audio/useAudioEngine'
import { Dropzone } from './components/Dropzone'
import { Caption } from './components/Caption'
import { CopyLink, ReadAloud } from './components/Extras'
import { Gallery } from './components/Gallery'
import { MapView } from './components/MapView'
import { Mixer } from './components/Mixer'
import { ModeToggle } from './components/ModeToggle'
import { PianoRoll } from './components/PianoRoll'
import { PlayerBar } from './components/PlayerBar'
import { describeCompare, describePiece, describeSeries } from './describe'
import { setLink } from './link'
import { narrationKey, narrationText } from './narration'
import { speak, type Speech } from './speech'
import { TOUR, tourText } from './tour'
import { TourBar } from './components/TourBar'
import { ThemePicker } from './components/ThemePicker'
import { joinFrames, segmentAt } from './series'
import { framesOf, imageUrl, prerendered, TRACKS, trackUrl, type Track } from './tracks'

interface Frame {
  id: string | null // jukebox image id; null for uploads
  blob: Blob
  name: string
  url: string
  label: string
}

interface Source {
  name: string
  track: Track | null
  frames: Frame[] // one image, or several for a time-lapse
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

export default function App() {
  const [mode, setMode] = useState<AnalysisMode>('adaptive')
  const [source, setSource] = useState<Source | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<AnalyzeResult[] | null>(null)
  const [rate, setRate] = useState(1)
  const [muted, setMuted] = useState<Set<Voice>>(new Set())
  const [reverb, setReverb] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false) // eco dynos nap; the first call can take a while
  const [announce, setAnnounce] = useState('') // read out by screen readers
  const abortRef = useRef<AbortController | null>(null)
  const stageRef = useRef<HTMLElement>(null)

  // All frames on one timeline, at the chosen speed.
  // Compare mode: a second single-image track in the other ear.
  const [compareId, setCompareId] = useState<string | null>(null)
  const [compareResult, setCompareResult] = useState<AnalyzeResult | null>(null)
  const compareTrack = TRACKS.find((t) => t.id === compareId) ?? null

  const joined = useMemo(() => {
    if (!results || !source || results.length !== source.frames.length) return null
    const j = joinFrames(results.map((r, i) => ({ result: atSpeed(r, rate), label: source.frames[i].label, imageUrl: source.frames[i].url })))
    if (!compareResult || results.length !== 1) return j
    // Stretch the other image to the same pace, so slice i of both plays together.
    const a = j.segments[0].result
    const b = atSpeed(compareResult, (rate * compareResult.stepSec) / results[0].stepSec)
    const left = a.notes.map((n) => ({ ...n, pan: -0.9 }))
    const right = b.notes.map((n) => ({ ...n, pan: 0.9 }))
    return {
      ...j,
      compare: b,
      piece: { ...j.piece, notes: [...left, ...right], musicSec: Math.max(a.musicSec, b.musicSec) },
    }
  }, [results, source, rate, compareResult])
  const piece = joined?.piece ?? null
  const audio = useAudioEngine(status === 'ready' && piece ? piece.notes : null, 1, muted, reverb)
  const { playing, time, toggle, seek } = audio

  useEffect(() => {
    setCompareResult(null)
    if (!compareTrack) return
    let live = true
    void (async () => {
      const r =
        (await prerendered(compareTrack.id, compareTrack.mode)) ||
        (await analyze(await (await fetch(trackUrl(compareTrack))).blob(), `${compareTrack.id}.jpg`, compareTrack.mode,
          compareTrack.crop, undefined, compareTrack.cropTop, compareTrack.scale))
      if (live) setCompareResult(r)
    })().catch(() => live && setCompareId(null))
    return () => { live = false }
  }, [compareTrack])

  // Wake the server while people look around, so their first upload is quick.
  useEffect(() => {
    fetch(`${API_URL}/api/health`).catch(() => {})
  }, [])

  const run = useCallback(async (src: Source, m: AnalysisMode) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const title = src.track?.title ?? src.name
    setStatus('loading')
    setError(null)
    setSlow(false)
    setAnnounce(`Composing ${title}…`)
    const slowTimer = setTimeout(() => setSlow(true), 4000)

    try {
      // Jukebox images are ready-made; only your own images need the engine.
      const res = await Promise.all(
        src.frames.map(
          async (f) =>
            (f.id && (await prerendered(f.id, m))) ||
            (await analyze(f.blob, f.name, m, src.track?.crop, ctrl.signal, src.track?.cropTop, src.track?.scale)),
        ),
      )
      if (ctrl.signal.aborted) return
      setResults(res)
      setStatus('ready')
      setAnnounce(`${title} is ready. Press space to play, or focus the image to explore it slice by slice.`)
    } catch (e) {
      if (ctrl.signal.aborted) return
      const message = e instanceof Error ? e.message : 'Something went wrong'
      setResults(null)
      setError(message)
      setStatus('error')
      setAnnounce(`Error: ${message}`)
    } finally {
      clearTimeout(slowTimer)
    }
  }, [])

  const pickSource = (src: Source, m: AnalysisMode) => {
    setSource((old) => {
      for (const f of old?.frames ?? []) if (!f.id) URL.revokeObjectURL(f.url)
      return src
    })
    void run(src, m)
  }

  // On phones the player sits below the jukebox, so bring it into view once it's drawn.
  useEffect(() => {
    if (source && window.matchMedia('(max-width: 860px)').matches) {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      stageRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    }
  }, [source])

  const fail = (message: string) => {
    setError(message)
    setStatus('error')
    setAnnounce(`Error: ${message}`)
  }

  const onFile = (file: File) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return fail('Please pick a PNG or JPEG image.')
    if (file.size > MAX_UPLOAD_BYTES) return fail('That image is over 20 MB. Try a smaller copy.')
    setLink(null, null) // uploads can't be shared by link
    setCompareId(null)
    const frame = { id: null, blob: file, name: file.name, url: URL.createObjectURL(file), label: '' }
    pickSource({ name: file.name, track: null, frames: [frame] }, mode)
  }

  const onTrack = async (id: string, m?: AnalysisMode) => {
    const track = TRACKS.find((t) => t.id === id)
    if (!track) return
    const useMode = m ?? track.mode // each track starts in the mode that suits it
    if (track.frames || compareId === id) setCompareId(null)
    try {
      const frames = await Promise.all(
        framesOf(track).map(async (f) => {
          const url = imageUrl(f.id)
          return { id: f.id, blob: await (await fetch(url)).blob(), name: `${f.id}.jpg`, url, label: f.label }
        }),
      )
      setMode(useMode)
      pickSource({ name: track.title, track, frames }, useMode)
    } catch {
      fail('Could not load that track.')
    }
  }

  // Changing mode re-runs the current image.
  const onMode = (m: AnalysisMode) => {
    setMode(m)
    if (source) void run(source, m)
  }

  // Open the track named in the link (?track=co&mode=terrain), once.
  const linkOpened = useRef(false)
  useEffect(() => {
    if (linkOpened.current) return
    linkOpened.current = true
    const q = new URLSearchParams(location.search)
    const id = q.get('track')
    const m = q.get('mode')
    if (id) void onTrack(id, m === 'adaptive' || m === 'terrain' ? m : undefined)
    const other = q.get('compare')
    if (id && other && other !== id) setCompareId(other)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Space bar plays/pauses, unless you're on a control that already uses it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && status === 'ready' && !['BUTTON', 'INPUT', 'A'].includes(tag)) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, toggle])

  // ---- Guided tour: words, then the track, then the next step ----
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [tourPhase, setTourPhase] = useState<'load' | 'talk' | 'play'>('talk')
  const speechRef = useRef<Speech | null>(null)
  const wasPlaying = useRef(false)

  const stopTour = () => {
    speechRef.current?.stop()
    if (playing) toggle()
    setTourStep(null)
  }
  const nextStep = useCallback(() => {
    speechRef.current?.stop()
    setTourStep((i) => (i === null || i + 1 >= TOUR.length ? null : i + 1))
  }, [])
  const startTour = () => {
    audio.unlock()
    setTourStep(0)
  }

  // A new step: load its track, or just talk.
  useEffect(() => {
    if (tourStep === null) return
    const step = TOUR[tourStep]
    if (step.track) {
      setTourPhase('load')
      void onTrack(step.track)
    } else {
      setTourPhase('talk')
      const sp = speak(tourText(step, null, []), step.key)
      speechRef.current = sp
      void sp.done.then(() => setTourStep((i) => (i === tourStep ? (i + 1 < TOUR.length ? i + 1 : null) : i)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep])

  // Track ready: say the words, then play it.
  useEffect(() => {
    if (tourStep === null || tourPhase !== 'load') return
    const step = TOUR[tourStep]
    if (status !== 'ready' || !audio.ready || !source || source.track?.id !== step.track || !results) return
    setTourPhase('talk')
    const sp = speak(tourText(step, results, source.frames.map((f) => f.label)), step.key)
    speechRef.current = sp
    void sp.done.then(() => {
      if (speechRef.current !== sp) return // skipped or stopped meanwhile
      setTourPhase('play')
      seek(0)
    })
  }, [tourStep, tourPhase, status, audio.ready, source, results, seek])

  // Track finished on its own (not paused): next step.
  useEffect(() => {
    if (tourStep !== null && tourPhase === 'play' && wasPlaying.current && !playing && time === 0) nextStep()
    wasPlaying.current = playing
  }, [playing, time, tourStep, tourPhase, nextStep])

  // The address bar follows the open track, its mode and any comparison, so it can be shared.
  useEffect(() => {
    if (source?.track) setLink(source.track.id, mode === source.track.mode ? null : mode, compareId)
  }, [source, mode, compareId])

  const loading = status === 'loading'
  const track = source?.track ?? null
  const title = track?.title ?? source?.name ?? ''
  const baseName = track?.id ?? (source?.name ?? 'map').replace(/\.[^.]+$/, '')
  const ready = status === 'ready' && joined && audio.ready
  const series = (joined?.segments.length ?? 0) > 1

  // The frame on screen: the one playing, or the first.
  const segIndex = joined ? segmentAt(joined.segments, time) : 0
  const seg = joined?.segments[segIndex] ?? null
  const segTime = seg && time > 0 ? Math.max(time - seg.start, 0.0001) : 0
  const shownFrame = source?.frames[segIndex] ?? source?.frames[0]

  // Described at normal speed, so the pre-made narration always matches.
  const info = track ?? undefined
  const description = !results || !source
    ? ''
    : series
      ? describeSeries(results.map((r, i) => ({ result: r, label: source.frames[i].label })), title)
      : describePiece(results[0], title, info)
  const compareText = joined && 'compare' in joined && joined.compare && compareTrack
    ? describeCompare(joined.segments[0].result, joined.compare, title, compareTrack.title, info)
    : ''
  const spoken = results && source
    ? [narrationText(track, title, results, source.frames.map((f) => f.label)), compareText].filter(Boolean).join(' ')
    : ''

  const toggleLayer = (v: Voice) =>
    setMuted((old) => {
      const next = new Set(old)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  const download = async () => {
    const blob = await audio.exportWav()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}-${piece?.analysisMode ?? 'sonux'}.wav`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="app">
      <header>
        <div className="top">
          <h1>
            Sonux<span>Box</span>
          </h1>
          <ThemePicker />
        </div>
        <p>An Earth Jukebox: hear NASA's views of our changing planet. Each slice of the image, left to right, becomes a beat.</p>
        {tourStep === null && (
          <button className="tour-start" onClick={startTour}>▶ Take the guided tour</button>
        )}
      </header>

      {tourStep !== null && (
        <TourBar step={tourStep} total={TOUR.length} phase={tourPhase}
          title={TOUR[tourStep].track ? (track?.title ?? '') : tourStep === 0 ? 'Welcome' : 'The end'}
          onSkip={nextStep} onStop={stopTour} />
      )}

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <main>
        <section className="inputs" aria-label="Choose an image">
          <h2>Earth Jukebox</h2>
          <Gallery activeId={track?.id ?? null} onPick={(id) => { if (tourStep !== null) stopTour(); void onTrack(id) }} disabled={loading} />
          <h2>Or use your own image</h2>
          <Dropzone onFile={onFile} disabled={loading} />
          <ModeToggle mode={mode} onChange={onMode} disabled={loading} />
        </section>

        <section className={`stage${source ? ' has-source' : ''}`} ref={stageRef} aria-label="Player">
          {!source && (
            <div className="empty">
              <p>Pick a track to hear it.</p>
              <p className="sub">Higher features play higher notes. Busy areas play louder.</p>
            </div>
          )}

          {source && shownFrame && (
            <>
              <div className="stage-head">
                <div>
                  <h2>{title}</h2>
                  {track && (
                    <a className="source" href={track.source.url} target="_blank" rel="noreferrer">
                      {track.source.label}
                    </a>
                  )}
                  {track && <CopyLink />}
                </div>
                {(loading || (status === 'ready' && audio.rendering)) && (
                  <span className="status">
                    <span className="spinner" aria-hidden="true" />
                    {loading ? (slow ? 'Waking the server up, this can take ~20 s…' : 'Composing…') : 'Rendering sound…'}
                  </span>
                )}
              </div>

              {status === 'error' && error && <p className="error">{error}</p>}

              {series && joined && (
                <div className="frames" role="group" aria-label="Frames">
                  {joined.segments.map((s, i) => (
                    <button key={s.label} className={i === segIndex ? 'on' : ''} aria-pressed={i === segIndex}
                      onClick={() => seek(s.start)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              <div className={compareTrack && joined && 'compare' in joined ? 'compare-maps' : ''}>
              {compareTrack && <p className="ear">Left ear · {title}</p>}
              <MapView
                imageUrl={shownFrame.url}
                imageAlt={track ? `${track.title}${shownFrame.label ? `, ${shownFrame.label}` : ''}. ${track.about}` : `Your image, ${source.name}`}
                label={series ? shownFrame.label : ''}
                result={status === 'ready' && seg ? seg.result : null}
                time={segTime}
                playing={playing}
                onSeek={(t) => seek((seg?.start ?? 0) + t)}
                info={info}
              />
              {compareTrack && joined && 'compare' in joined && joined.compare && (
                <>
                  <p className="ear">Right ear · {compareTrack.title}</p>
                  <MapView imageUrl={trackUrl(compareTrack)} imageAlt={`${compareTrack.title} map. ${compareTrack.about}`}
                    result={joined.compare} time={segTime} playing={playing} onSeek={seek} info={compareTrack} />
                </>
              )}
              </div>

              {ready && piece && seg && (
                <>
                  <PlayerBar result={piece} playing={playing} time={time} duration={audio.duration}
                    onToggle={toggle} onDownload={download} />
                  <Mixer muted={muted} onToggle={toggleLayer} rate={rate} onRate={setRate}
                    reverb={reverb} onReverb={() => setReverb((r) => !r)}
                    hasPerc={piece.notes.some((n) => n.voice === 'perc')}
                    layers={(seg.result.layers ?? []).filter((l) => piece.notes.some((n) => n.voice === l.voice))} info={info} />
                  {track && !series && (
                    <label className="compare-pick">
                      Compare with
                      <select value={compareId ?? ''} onChange={(e) => {
                        const v = e.target.value || null
                        setCompareId(v)
                      }}>
                        <option value="">nothing (one image)</option>
                        {TRACKS.filter((t) => !t.frames && t.id !== track.id).map((t) => (
                          <option key={t.id} value={t.id}>{t.title}{t.geo && track.geo ? ' · same map' : ''}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <Caption result={seg.result} time={segTime} playing={playing} info={info} />
                  <PianoRoll result={piece} time={time} onSeek={seek} muted={muted} info={info}
                    marks={series ? joined.segments.map((s) => ({ at: s.start, label: s.label })) : []} />

                  <section className="hearing" aria-labelledby="hearing-title">
                    <div className="hearing-head">
                      <h3 id="hearing-title">What you're hearing</h3>
                      <ReadAloud text={spoken} recording={track ? narrationKey(track, mode) : undefined} />
                    </div>
                    {track && <p className="about">{track.about} {track.listen}</p>}
                    <p>{description}</p>
                    {compareText && <p className="compare-text">{compareText}</p>}
                    <details>
                      <summary>How the image becomes music</summary>
                      <ul>
                        <li>The image is read left to right in {seg.result.columns} slices, one per beat. The sound moves from your left ear to your right as it goes.</li>
                        <li>Where the signal sits higher in the image, the melody plays higher notes.</li>
                        <li>Stronger signal plays louder; quiet slices are rests.</li>
                        <li>
                          {piece.analysisMode === 'adaptive'
                            ? "The image's main colour picks the key, and how busy it is picks the scale and tempo."
                            : 'Greener maps play in a major key; more land makes the tempo faster.'}
                        </li>
                        <li>Sudden jumps in the signal get a drum hit.</li>
                        {series && <li>A time-lapse plays each image in turn, so you can hear how it changed.</li>}
                        <li>Hover over, drag across, or arrow through the image to hear one slice at a time.</li>
                      </ul>
                    </details>
                  </section>
                </>
              )}
            </>
          )}

          {!source && status === 'error' && error && <p className="error">{error}</p>}
        </section>
      </main>

      <footer>
        <p>Space plays and pauses. Click the image or the notes to jump around.</p>
        <p>
          Built by team SonuX for NASA Space Apps 2026. Imagery from NASA's{' '}
          <a href="https://svs.gsfc.nasa.gov/gallery/earth-information-center/" target="_blank" rel="noreferrer">
            Earth Information Center
          </a>{' '}
          and Scientific Visualization Studio.
        </p>
      </footer>
    </div>
  )
}
