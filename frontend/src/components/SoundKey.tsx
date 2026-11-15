import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalyzeResult } from '../api'
import type { TrackInfo } from '../describe'
import { renderStems } from '../audio/synth'
import { keyPhrase, phraseKey, soundKey, type KeyItem } from '../soundKey'
import { speak, type Speech } from '../speech'

const RATE = 44100
let ctx: AudioContext | null = null

// Plays one sample through the same synth as the piece. Resolves when it has rung out.
function playItem(item: KeyItem): { done: Promise<void>; stop: () => void } {
  if (!item.notes.length) return { done: new Promise((ok) => setTimeout(ok, 700)), stop: () => {} }
  ctx ??= new AudioContext({ sampleRate: RATE })
  void ctx.resume()
  const { stems, length } = renderStems(item.notes, RATE, 0)
  const buf = ctx.createBuffer(2, length, RATE)
  const l = buf.getChannelData(0), r = buf.getChannelData(1)
  for (const s of Object.values(stems)) {
    for (let i = 0; i < length; i++) {
      l[i] += s.left[i] * 1.6 // fixed gain, so soft and loud keep their difference
      r[i] += s.right[i] * 1.6
    }
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  let stop = () => {}
  const done = new Promise<void>((ok) => {
    src.onended = () => ok()
    stop = () => { try { src.stop() } catch { /* done already */ } ok() }
  })
  return { done, stop }
}

interface Props {
  result: AnalyzeResult
  info?: TrackInfo
  onBusy: () => void // pause the piece while the key plays
}

// "Colour bar for the ears": what low/high, soft/loud and each instrument mean here.
export function SoundKey({ result, info, onBusy }: Props) {
  const items = useMemo(() => soundKey(result, info), [result, info])
  const [active, setActive] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const stopRef = useRef<() => void>(() => {})
  const cancelled = useRef(false)

  const stop = () => {
    cancelled.current = true
    stopRef.current()
    setActive(null)
    setRunning(false)
  }
  useEffect(() => () => stop(), [result]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.addEventListener('sonux:music', stop) // the music started
    return () => window.removeEventListener('sonux:music', stop)
  }) // re-binds each render so it always has the current stop()

  const one = async (it: KeyItem) => {
    stop()
    onBusy()
    cancelled.current = false
    setActive(it.id)
    const p = playItem(it)
    stopRef.current = p.stop
    await p.done
    if (!cancelled.current) setActive(null)
  }

  // The whole key, spoken: "Low note: ..." then the sound, entry by entry.
  const all = async () => {
    if (running) return stop()
    stop()
    onBusy()
    cancelled.current = false
    setRunning(true)
    for (const it of items) {
      if (cancelled.current) return
      setActive(it.id)
      const text = keyPhrase(it)
      const sp: Speech = speak(text, phraseKey(text))
      stopRef.current = sp.stop
      await sp.done
      if (cancelled.current) return
      const p = playItem(it)
      stopRef.current = p.stop
      await p.done
      await new Promise((ok) => setTimeout(ok, 250))
    }
    setActive(null)
    setRunning(false)
  }

  if (!items.length) return null
  return (
    <section className="soundkey" aria-labelledby="soundkey-title">
      <div className="hearing-head">
        <h3 id="soundkey-title">Sound key</h3>
        <button className="linkbtn" onClick={all} aria-pressed={running}>
          {running ? 'Stop' : '▶ Hear the key'}
        </button>
      </div>
      <p className="hint">Like a map's colour bar, but for your ears. Tap one to hear it.</p>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <button className={`${it.voice}${active === it.id ? ' on' : ''}`} onClick={() => void one(it)}
              style={it.hex ? ({ '--swatch': it.hex } as React.CSSProperties) : undefined}
              aria-label={`Play: ${keyPhrase(it)}`} aria-current={active === it.id ? 'true' : undefined}>
              <b>{it.name}</b>
              <span>{it.meaning}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
