import { useCallback, useEffect, useRef, useState } from 'react'
import { analyze, fetchAudio, MAX_UPLOAD_BYTES, type AnalysisMode, type AnalyzeResult } from './api'
import { Dropzone } from './components/Dropzone'
import { Gallery } from './components/Gallery'
import { MapView } from './components/MapView'
import { ModeToggle } from './components/ModeToggle'
import { PianoRoll } from './components/PianoRoll'
import { PlayerBar } from './components/PlayerBar'
import { SAMPLES, sampleUrl } from './samples'
import { usePlayback } from './usePlayback'

interface Source {
  blob: Blob
  name: string
  previewUrl: string
  sampleId: string | null
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

export default function App() {
  const [mode, setMode] = useState<AnalysisMode>('adaptive')
  const [source, setSource] = useState<Source | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false) // eco dynos nap; the first call can take a while
  const abortRef = useRef<AbortController | null>(null)
  const stageRef = useRef<HTMLElement>(null)

  const { playing, time, toggle, seek } = usePlayback(audioUrl)

  const run = useCallback(async (src: Source, m: AnalysisMode) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setStatus('loading')
    setError(null)
    setSlow(false)
    const slowTimer = setTimeout(() => setSlow(true), 4000)

    try {
      const res = await analyze(src.blob, src.name, m, ctrl.signal)
      const wav = await fetchAudio(res.audioUrl, ctrl.signal)
      setResult(res)
      setAudioUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(wav)
      })
      setStatus('ready')
    } catch (e) {
      if (ctrl.signal.aborted) return
      setResult(null)
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStatus('error')
    } finally {
      clearTimeout(slowTimer)
    }
  }, [])

  const pickSource = (src: Source) => {
    setSource((old) => {
      if (old && !old.sampleId) URL.revokeObjectURL(old.previewUrl)
      return src
    })
    void run(src, mode)
  }

  // On phones the player sits below the gallery, so bring it into view once it's drawn.
  useEffect(() => {
    if (source && window.matchMedia('(max-width: 860px)').matches) {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [source])

  const onFile = (file: File) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setError('Please pick a PNG or JPEG image.')
      setStatus('error')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That image is over 20 MB. Try a smaller copy.')
      setStatus('error')
      return
    }
    pickSource({ blob: file, name: file.name, previewUrl: URL.createObjectURL(file), sampleId: null })
  }

  const onSample = async (id: string) => {
    const url = sampleUrl(id)
    try {
      const blob = await (await fetch(url)).blob()
      pickSource({ blob, name: `${id}.jpg`, previewUrl: url, sampleId: id })
    } catch {
      setError('Could not load that sample.')
      setStatus('error')
    }
  }

  // Changing mode re-runs the current image.
  const onMode = (m: AnalysisMode) => {
    setMode(m)
    if (source) void run(source, m)
  }

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

  const loading = status === 'loading'
  const label = source?.sampleId ? SAMPLES.find((s) => s.id === source.sampleId)?.label : source?.name
  const baseName = (source?.name ?? 'map').replace(/\.[^.]+$/, '')

  return (
    <div className="app">
      <header>
        <h1>
          Sonux<span>Box</span>
        </h1>
        <p>Turn a map of our planet into music. Each slice of the image, left to right, becomes a beat.</p>
      </header>

      <main>
        <section className="inputs" aria-label="Choose an image">
          <Dropzone onFile={onFile} disabled={loading} />
          <ModeToggle mode={mode} onChange={onMode} disabled={loading} />
          <h2>Or try a sample</h2>
          <Gallery activeId={source?.sampleId ?? null} onPick={onSample} disabled={loading} />
        </section>

        <section className={`stage${source ? ' has-source' : ''}`} aria-live="polite" ref={stageRef}>
          {!source && (
            <div className="empty">
              <p>Pick a map to hear it.</p>
              <p className="sub">Higher features play higher notes. Busy areas play louder.</p>
            </div>
          )}

          {source && (
            <>
              <div className="stage-head">
                <h2>{label}</h2>
                {loading && (
                  <span className="status">
                    <span className="spinner" aria-hidden="true" />
                    {slow ? 'Waking the server up, this can take ~20 s…' : 'Composing…'}
                  </span>
                )}
              </div>

              {status === 'error' && error && <p className="error">{error}</p>}

              <MapView
                imageUrl={source.previewUrl}
                result={status === 'ready' ? result : null}
                time={time}
                onSeek={seek}
              />

              {status === 'ready' && result && audioUrl && (
                <>
                  <PlayerBar
                    result={result}
                    playing={playing}
                    time={time}
                    onToggle={toggle}
                    audioUrl={audioUrl}
                    fileName={`${baseName}-${result.analysisMode}.wav`}
                  />
                  <PianoRoll result={result} time={time} onSeek={seek} />
                </>
              )}
            </>
          )}

          {!source && status === 'error' && error && <p className="error">{error}</p>}
        </section>
      </main>

      <footer>
        Click the map or the notes to jump around. Space bar plays and pauses.
      </footer>
    </div>
  )
}
