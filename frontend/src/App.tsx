import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyze, API_URL, atSpeed, MAX_UPLOAD_BYTES, type AnalysisMode, type AnalyzeResult, type Voice } from './api'
import { useAudioEngine } from './audio/useAudioEngine'
import { Dropzone } from './components/Dropzone'
import { Caption } from './components/Caption'
import { CopyLink, ReadAloud } from './components/Extras'
import { Jukebox, type NowPlaying } from './components/Jukebox'
import { MapView } from './components/MapView'
import { Mixer } from './components/Mixer'
import { ModeToggle } from './components/ModeToggle'
import { PianoRoll } from './components/PianoRoll'
import { PlayerBar } from './components/PlayerBar'
import { describeCompare, describePiece, describeSeries } from './describe'
import { setLink, setLiveLink } from './link'
import { coastlines, displayImage, fetchColormap, fetchWorld, LIVE_LAYERS, liveTrack, parseColormap, pixelsOf, pngOf, prettyDate, readValues, validDate } from './live'
import { LivePanel } from './components/LivePanel'
import { SoundKey } from './components/SoundKey'
import { DataPanel } from './components/DataPanel'
import { narrationKey, narrationText } from './narration'
import { speak, type Speech } from './speech'
import { TOUR, tourText } from './tour'
import { TourBar } from './components/TourBar'
import { ThemePicker } from './components/ThemePicker'
import { joinFrames, segmentAt } from './series'
import { framesOf, imageUrl, prerendered, TRACKS, trackUrl, type Track } from './tracks'
import { ALL_TRACKS, codeOfTrack, itemKey, itemLabel, shuffled, STATIONS, type QItem } from './queue'
import type { LiveLayer } from './live'

interface Frame {
  id: string | null // jukebox image id; null for uploads
  blob: Blob
  name: string
  url: string
  label: string
  // Live maps: real readings per slice from the layer's colour table, around a given height.
  readAt?: (heights: (number | undefined)[]) => (number | undefined)[]
  cacheKey?: string // live frames are cached, so the next one can be fetched ahead of time
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
  const { playing, time, toggle, seek, canPlay } = audio

  // Set when someone asks for a piece (a tile, "Play this day", an upload): it starts by
  // itself once it's ready. Links opened cold don't, since browsers block sound without a click.
  const autoplay = useRef(false)
  const userPlay = () => {
    audio.unlock()
    autoplay.current = true
  }
  // Each pick gets a number, so a slow load can't replace something picked after it.
  const pickId = useRef(0)

  // Music, spoken descriptions and the sound key take turns.
  useEffect(() => {
    if (playing) window.dispatchEvent(new Event('sonux:music'))
  }, [playing])

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

  // Live maps get composed ahead of time while the previous piece plays, so they're kept.
  const analyzeCache = useRef(new Map<string, Promise<AnalyzeResult>>())
  const analyzeCached = useCallback((f: Frame, m: AnalysisMode) => {
    const key = `${f.cacheKey}|${m}`
    let p = analyzeCache.current.get(key)
    if (!p) {
      p = analyze(f.blob, f.name, m, 0, undefined, 0)
      p.catch(() => analyzeCache.current.delete(key))
      analyzeCache.current.set(key, p)
      while (analyzeCache.current.size > 8) analyzeCache.current.delete(analyzeCache.current.keys().next().value!)
    }
    return p
  }, [])

  const run = useCallback(async (src: Source, m: AnalysisMode) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const title = src.track?.title ?? src.name
    setResults(null) // stops the old piece, so it doesn't play under the new image
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
            (f.cacheKey ? await analyzeCached(f, m) : null) ||
            (await analyze(f.blob, f.name, m, src.track?.crop, ctrl.signal, src.track?.cropTop, src.track?.scale)),
        ),
      )
      if (ctrl.signal.aborted) return
      // Live maps: put the exact readings in, when the slices line up.
      res.forEach((r, i) => {
        const read = src.frames[i].readAt
        if (!read || r.columns !== 32) return
        const v = read(r.columnStats.map((c) => c.peakPos ?? c.landPos))
        r.columnStats = r.columnStats.map((c, j) => ({ ...c, value: v[j] }))
      })
      setResults(res)
      setStatus('ready')
      setAnnounce(`${title} is ready. Press space to play, or focus the image to explore it slice by slice.`)
    } catch (e) {
      if (ctrl.signal.aborted) return
      let message = e instanceof Error ? e.message : 'Something went wrong'
      if (src.track?.live && /uniform|no signal/i.test(message))
        message = 'NASA has no data for that day yet (or the map is empty). Try a day or two earlier.'
      autoplay.current = false
      setResults(null)
      setError(message)
      setStatus('error')
      setAnnounce(`Error: ${message}`)
    } finally {
      clearTimeout(slowTimer)
    }
  }, [analyzeCached])

  const pickSource = (src: Source, m: AnalysisMode) => {
    setSource((old) => {
      for (const f of old?.frames ?? []) if (!f.id && !f.cacheKey) URL.revokeObjectURL(f.url)
      return src
    })
    void run(src, m)
  }

  const fail = (message: string) => {
    autoplay.current = false
    setError(message)
    setStatus('error')
    setAnnounce(`Error: ${message}`)
  }

  const onFile = (file: File) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return fail('Please pick a PNG or JPEG image.')
    if (file.size > MAX_UPLOAD_BYTES) return fail('That image is over 20 MB. Try a smaller copy.')
    ++pickId.current
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
    const pick = ++pickId.current
    try {
      const frames = await Promise.all(
        framesOf(track).map(async (f) => {
          const url = imageUrl(f.id)
          return { id: f.id, blob: await (await fetch(url)).blob(), name: `${f.id}.jpg`, url, label: f.label }
        }),
      )
      if (pick !== pickId.current) return // something else was picked meanwhile
      setMode(useMode)
      pickSource({ name: track.title, track, frames }, useMode)
    } catch {
      if (pick === pickId.current) fail('Could not load that track.')
    }
  }

  // A live NASA map (or two days of one): fetch, read the real values. Cached, so the
  // jukebox can fetch the next day while this one plays.
  const liveCache = useRef(new Map<string, Promise<Frame[]>>())
  const getLiveFrames = (layer: LiveLayer, date: string, then?: string) => {
    const key = `${layer.id}|${date}|${then ?? ''}`
    let p = liveCache.current.get(key)
    if (p) return p
    p = (async () => {
      // Colour table, coastlines and every tile of every day, all at once.
      const days = then ? [then, date] : [date]
      const [xml, coast, ...maps] = await Promise.all([
        fetchColormap(layer.colormap).catch(() => null),
        coastlines(),
        ...days.map((d) => fetchWorld(layer.gibs, layer.tiles, d)),
      ])
      const table = xml ? parseColormap(xml, layer.toUnit) : []
      return Promise.all(
        days.map(async (d, i): Promise<Frame> => {
          const map = maps[i]
          if (!map) throw new Error('gibs')
          const px = table.length ? pixelsOf(map) : null
          const readAt = px ? (at: (number | undefined)[]) => readValues(px, map.width, map.height, table, 32, at) : undefined
          const [blob, url] = await Promise.all([pngOf(map), displayImage(map, coast)])
          return { id: null, blob, name: `${layer.id}-${d}.png`, url, label: then ? prettyDate(d) : '', readAt, cacheKey: `${layer.id}|${d}` }
        }),
      )
    })()
    p.catch(() => liveCache.current.delete(key))
    liveCache.current.set(key, p)
    while (liveCache.current.size > 4) liveCache.current.delete(liveCache.current.keys().next().value!)
    return p
  }

  // A live NASA map (or two days of one): fetch, read the real values, then play.
  const [liveBusy, setLiveBusy] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const onLive = async (layerId: string, date: string, then?: string) => {
    const layer = LIVE_LAYERS.find((l) => l.id === layerId)
    if (!layer) return
    const pick = ++pickId.current
    setCompareId(null)
    setLiveError(null)
    setLiveBusy(true)
    setAnnounce(`Fetching ${layer.title} from NASA…`)
    try {
      const frames = await getLiveFrames(layer, date, then)
      if (pick !== pickId.current) return // something else was picked meanwhile
      setMode('adaptive')
      const track = liveTrack(layer, date, then)
      setLiveLink(layer.id, date, then)
      pickSource({ name: track.title, track, frames }, 'adaptive')
    } catch {
      if (pick !== pickId.current) return
      // Shown next to the form, where you are, rather than up in the player.
      const message = "Couldn't get that map from NASA. Check your connection, or try another day."
      autoplay.current = false
      setLiveError(message)
      setAnnounce(`Error: ${message}`)
    } finally {
      setLiveBusy(false)
    }
  }

  // Changing mode re-runs the current image.
  const onMode = (m: AnalysisMode) => {
    setMode(m)
    if (playing) userPlay() // keep playing in the new mode
    if (source) void run(source, m)
  }

  // Open the track named in the link (?track=co&mode=terrain), once.
  const linkOpened = useRef(false)
  useEffect(() => {
    if (linkOpened.current) return
    linkOpened.current = true
    const q = new URLSearchParams(location.search)
    const live = q.get('live'), day = q.get('date'), then = q.get('then')
    if (live && validDate(day)) {
      void onLive(live, day, validDate(then) && then < day ? then : undefined)
      return
    }
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
      if (e.code === 'Space' && status === 'ready' && !['BUTTON', 'INPUT', 'A', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(tag)) {
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
    if (source?.track?.live) return // set when it was fetched
    if (source?.track) setLink(source.track.id, mode === source.track.mode ? null : mode, compareId)
  }, [source, mode, compareId])

  const loading = status === 'loading'
  const track = source?.track ?? null
  const title = track?.title ?? source?.name ?? ''
  const baseName = track?.id ?? (source?.name ?? 'map').replace(/\.[^.]+$/, '')
  const ready = status === 'ready' && joined && audio.ready
  const series = (joined?.segments.length ?? 0) > 1

  // Asked-for pieces start as soon as their sound is ready.
  useEffect(() => {
    if (!autoplay.current || status !== 'ready' || !audio.ready) return
    autoplay.current = false
    if (!canPlay()) return // the browser wants a click first; the play button is right there
    seek(0)
    setAnnounce(`Playing ${title}. Space pauses.`)
  }, [status, audio.ready, canPlay, seek, title])

  // Picking what's already loaded (a tile, or the same live day) plays or pauses it instead of reloading.
  const isLoaded = (t: { id?: string; live?: { layer: string; date: string; then?: string } }) =>
    status === 'ready' && audio.ready && !!track &&
    (t.live
      ? !!track.live && track.live.layer === t.live.layer && track.live.date === t.live.date && track.live.then === t.live.then
      : !track.live && track.id === t.id)

  // ---- The jukebox: a queue, stations, and moving on when a piece ends ----
  type Queued = QItem & { station?: boolean } // station days sit behind anything you picked
  const [queue, setQueue] = useState<Queued[]>([])
  const [stationId, setStationId] = useState<string | null>(null)
  const station = STATIONS.find((s) => s.id === stationId) ?? null
  const [jbMsg, setJbMsg] = useState('')
  const history = useRef<QItem[]>([])
  const currentItem: QItem | null = !track
    ? null
    : track.live
      ? { kind: 'live', layer: track.live.layer, date: track.live.date, then: track.live.then }
      : { kind: 'track', id: track.id }
  const currentKey = currentItem ? itemKey(currentItem) : null

  const say = (text: string) => {
    setJbMsg(text)
    setAnnounce(text)
  }
  const load = (q: QItem, remember = true) => {
    if (tourStep !== null) stopTour()
    if (remember && currentItem && itemKey(currentItem) !== itemKey(q)) history.current = [...history.current.slice(-19), currentItem]
    // Lift the needle now: if the old record ran out while the new one downloads, the queue would skip ahead.
    if (playing) toggle()
    userPlay()
    if (q.kind === 'track') void onTrack(q.id)
    else void onLive(q.layer, q.date, q.then)
  }
  // A jukebox pick: plays now if nothing's on, otherwise joins the queue (ahead of station days).
  const pick = (q: QItem) => {
    if (itemKey(q) === currentKey && status === 'ready' && audio.ready) return toggle()
    if (!playing && !loading && !liveBusy) {
      setJbMsg('')
      return load(q)
    }
    setQueue((old) => {
      const at = old.findIndex((x) => x.station)
      const next = at < 0 ? [...old, q] : [...old.slice(0, at), q, ...old.slice(at)]
      const pos = next.indexOf(q) + 1
      say(`${itemLabel(q)} added to the queue${pos === 1 ? ', plays next' : `, number ${pos}`}`)
      return next
    })
  }
  const startStation = (items: QItem[]) => {
    setQueue(items.slice(1).map((q) => ({ ...q, station: true })))
    load(items[0])
  }
  const next = () => {
    const [head, ...rest] = queue
    if (head) {
      setQueue(rest)
      return load(head)
    }
    if (station) startStation(station.items()) // round again, with fresh dates
  }
  const prev = () => {
    if (time > 3 || !history.current.length) return seek(0)
    const back = history.current.pop()!
    if (currentItem) setQueue((old) => [currentItem, ...old])
    load(back, false)
  }
  const onStation = (id: string) => {
    if (stationId === id) return clearQueue()
    const s = STATIONS.find((x) => x.id === id)!
    setStationId(id)
    say(`Tuned to ${s.title}: ${s.blurb.toLowerCase()}`)
    startStation(s.items())
  }
  const clearQueue = () => {
    setQueue([])
    if (stationId) say('Station off')
    setStationId(null)
  }
  const playAll = (items: QItem[], label: string) => {
    setStationId(null)
    say(label)
    setQueue(items.slice(1))
    load(items[0])
  }

  // Played to the end: on to the next record (the tour handles its own steps).
  const ends = audio.ends
  useEffect(() => {
    if (ends && tourStep === null) next()
  }, [ends]) // eslint-disable-line react-hooks/exhaustive-deps

  // While one piece plays, fetch and compose the next live day, so there's no wait between them.
  useEffect(() => {
    const n = queue[0]
    if (!playing || !n || n.kind !== 'live') return
    const layer = LIVE_LAYERS.find((l) => l.id === n.layer)
    if (!layer) return
    void getLiveFrames(layer, n.date, n.then)
      .then((fs) => Promise.all(fs.map((f) => analyzeCached(f, 'adaptive'))))
      .catch(() => {}) // it'll be tried again (and reported) when its turn comes
  }, [playing, queue]) // eslint-disable-line react-hooks/exhaustive-deps

  // The frame on screen: the one playing, or the first.
  const segIndex = joined ? segmentAt(joined.segments, time) : 0
  const seg = joined?.segments[segIndex] ?? null
  const segTime = seg && time > 0 ? Math.max(time - seg.start, 0.0001) : 0
  const shownFrame = source?.frames[segIndex] ?? source?.frames[0]
  const nowPlaying: NowPlaying | null = source ? {
    title,
    code: track && !track.live ? codeOfTrack(track.id) : null,
    image: shownFrame?.url ?? null,
    facts: status === 'error'
      ? (error ?? 'Something went wrong')
      : piece ? `${piece.scale} · ${Math.round(piece.bpm)} BPM${series && shownFrame?.label ? ` · ${shownFrame.label}` : ''}` : '',
    live: !!track?.live,
    ready: !!ready,
    loading: loading || (status === 'ready' && audio.rendering),
  } : null

  // Described at normal speed, so the pre-made narration always matches.
  // Worked out once per piece, not on every frame of playback.
  const info = track ?? undefined
  const compareRes = joined && 'compare' in joined ? joined.compare : null
  const { description, compareText, spoken } = useMemo(() => {
    if (!results || !source) return { description: '', compareText: '', spoken: '' }
    const t = source.track
    const name = t?.title ?? source.name
    const labels = source.frames.map((f) => f.label)
    const description = results.length > 1
      ? describeSeries(results.map((r, i) => ({ result: r, label: labels[i] })), name)
      : describePiece(results[0], name, t ?? undefined)
    const compareText = compareRes && compareTrack && results.length === 1
      ? describeCompare(results[0], compareRes, name, compareTrack.title, t ?? undefined)
      : ''
    const spoken = [narrationText(t, name, results, labels), compareText].filter(Boolean).join(' ')
    return { description, compareText, spoken }
  }, [results, source, compareRes, compareTrack])

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
      <div className="topbar">
        <ThemePicker />
      </div>

      {tourStep !== null && (
        <TourBar step={tourStep} total={TOUR.length} phase={tourPhase}
          title={TOUR[tourStep].track ? (track?.title ?? '') : tourStep === 0 ? 'Welcome' : 'The end'}
          onSkip={nextStep} onStop={stopTour} />
      )}

      <Jukebox now={nowPlaying} playing={playing} time={time} duration={audio.duration} currentKey={currentKey}
        queue={queue} station={station} stations={STATIONS} message={jbMsg} touring={tourStep !== null}
        onPick={pick} onToggle={toggle} onNext={next} onPrev={prev} onSeek={seek}
        onPlayAll={() => playAll(ALL_TRACKS, 'Playing all 12 records')}
        onShuffle={() => {
          if (queue.length > 1) {
            setQueue((q) => shuffled(q))
            return say('Queue shuffled')
          }
          playAll(shuffled(ALL_TRACKS), 'Shuffling all 12 records')
        }}
        onRemove={(i) => setQueue((q) => q.filter((_, j) => j !== i))}
        onPlayNow={(i) => {
          const q = queue[i]
          setQueue((old) => old.filter((_, j) => j !== i))
          load(q)
        }}
        onClear={clearQueue} onStation={onStation} onTour={startTour} />

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <main>
        <section className="inputs" aria-label="More ways to listen">
          <h2 id="live">Live from NASA, any day</h2>
          <LivePanel busy={liveBusy} error={liveError} onPlay={(l, d, t) => {
            if (tourStep !== null) stopTour()
            if (isLoaded({ live: { layer: l, date: d, then: t } })) return toggle()
            userPlay()
            void onLive(l, d, t)
          }} />
          <h2>Or use your own image</h2>
          <Dropzone onFile={(f) => { userPlay(); onFile(f) }} />
          <ModeToggle mode={mode} onChange={onMode} disabled={loading} />
        </section>

        <section className={`stage${source ? ' has-source' : ''}`} ref={stageRef} aria-label="Player">
          {!source && (
            <div className="empty">
              <p className="eyebrow">Liner notes</p>
              <p>Every record comes with its story.</p>
              <ul className="sub">
                <li>The map, with a needle you can drag to hear one slice at a time.</li>
                <li>Every note, a sound key, and the data behind it, in plain words.</li>
                <li>Works with a screen reader, a keyboard, or a finger.</li>
              </ul>
            </div>
          )}

          {source && shownFrame && (
            <>
              <div className="stage-head">
                <div>
                  <p className="eyebrow">Liner notes</p>
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
                    onToggle={toggle} onDownload={download} title={title} />
                  <Mixer muted={muted} onToggle={toggleLayer} rate={rate} onRate={setRate}
                    reverb={reverb} onReverb={() => setReverb((r) => !r)}
                    hasPerc={piece.notes.some((n) => n.voice === 'perc')}
                    layers={(seg.result.layers ?? []).filter((l) => piece.notes.some((n) => n.voice === l.voice))} info={info} />
                  {track && !track.live && !series && (
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
                  <SoundKey result={seg.result} info={info} onBusy={() => { if (playing) toggle() }} />

                  <section className="hearing" aria-labelledby="hearing-title">
                    <div className="hearing-head">
                      <h3 id="hearing-title">What you're hearing</h3>
                      <ReadAloud text={spoken} recording={track && !track.live ? narrationKey(track, mode) : undefined}
                        onStart={() => { if (playing) toggle() }} />
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
                  <DataPanel track={track} result={seg.result} />
                </>
              )}
            </>
          )}

          {!source && status === 'error' && error && <p className="error">{error}</p>}
        </section>
      </main>

      <footer>
        <p className="keys">Space plays and pauses. Click the image or the notes to jump around.</p>
        <p>
          Built in Accra, Ghana by team SonuX (Jonathan Mensah, Eyram Afi Kudzawu-D'Pherdd and Elynam Yawah
          Kudzawu-D'Pherdd) for <a href="https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/"
          target="_blank" rel="noreferrer">NASA Space Apps 2026: The Earth Information Jukebox</a>.{' '}
          <a href="https://github.com/Manyle4/SonuxBox" target="_blank" rel="noreferrer">Source on GitHub</a>.
        </p>
        <p>
          Imagery from NASA's{' '}
          <a href="https://svs.gsfc.nasa.gov/gallery/earth-information-center/" target="_blank" rel="noreferrer">
            Earth Information Center
          </a>{' '}
          and Scientific Visualization Studio, and live maps from{' '}
          <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">NASA GIBS</a>.
        </p>
      </footer>
    </div>
  )
}
