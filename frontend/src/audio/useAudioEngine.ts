import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note, Voice } from '../api'
import { VOICES, type Stem } from './synth'
import type { RenderRequest } from './synth.worker'
import { addReverb, REVERB_WET } from './reverb'
import { encodeWav } from './wav'

const SAMPLE_RATE = 44100

interface Rendered {
  stems: Record<Voice, Stem>
  length: number
  peak: number
}

// Renders notes in a worker, then plays the four layers through Web Audio so they can be
// muted live. Reports the playhead time every frame while playing.
export function useAudioEngine(notes: Note[] | null, gridSec: number, muted: Set<Voice>, reverb = true) {
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [rendering, setRendering] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [ends, setEnds] = useState(0) // counts pieces that played to the end (not paused or replaced)

  const workerRef = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const buffersRef = useRef<Record<Voice, AudioBuffer> | null>(null)
  const gainsRef = useRef<Record<Voice, GainNode> | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const wetRef = useRef<GainNode | null>(null)
  const reverbRef = useRef(reverb)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const startedAt = useRef(0) // context time when playback (re)started
  const offsetRef = useRef(0) // where in the piece it (re)started
  const playingRef = useRef(false)
  const timeRef = useRef(0)
  const mutedRef = useRef(muted)

  const duration = rendered ? rendered.length / SAMPLE_RATE : 0

  const ctx = () => {
    if (!ctxRef.current) {
      const c = new AudioContext({ sampleRate: SAMPLE_RATE })
      const master = c.createGain()
      const room = addReverb(c, c.destination, reverbRef.current)
      master.connect(room.input)
      wetRef.current = room.wet
      const gains = {} as Record<Voice, GainNode>
      for (const v of VOICES) {
        gains[v] = c.createGain()
        gains[v].gain.value = mutedRef.current.has(v) ? 0 : 1
        gains[v].connect(master)
      }
      ctxRef.current = c
      masterRef.current = master
      gainsRef.current = gains
    }
    return ctxRef.current
  }

  const stopSources = () => {
    for (const s of sourcesRef.current) {
      s.onended = null
      try { s.stop() } catch { /* already stopped */ }
    }
    sourcesRef.current = []
  }

  const startAt = useCallback((offset: number) => {
    const c = ctx()
    const buffers = buffersRef.current
    if (!buffers || !gainsRef.current) return
    stopSources()
    void c.resume()
    for (const v of VOICES) {
      const src = c.createBufferSource()
      src.buffer = buffers[v]
      src.connect(gainsRef.current[v])
      src.start(0, offset)
      sourcesRef.current.push(src)
    }
    startedAt.current = c.currentTime
    offsetRef.current = offset
    playingRef.current = true
    setPlaying(true)
  }, [])

  const pause = useCallback(() => {
    if (!playingRef.current || !ctxRef.current) return
    offsetRef.current += ctxRef.current.currentTime - startedAt.current
    stopSources()
    playingRef.current = false
    setPlaying(false)
  }, [])

  // Render whenever the notes change (new image or new speed).
  useEffect(() => {
    if (!notes) {
      setRendered(null)
      return
    }
    workerRef.current ??= new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' })
    const id = ++reqId.current
    setRendering(true)
    const worker = workerRef.current
    const onMsg = (e: MessageEvent<Rendered & { id: number }>) => {
      if (e.data.id !== id) return // an older render finished late
      setRendering(false)
      setRendered(e.data)
    }
    worker.addEventListener('message', onMsg)
    worker.postMessage({ id, notes, sampleRate: SAMPLE_RATE, gridSec } satisfies RenderRequest)
    return () => worker.removeEventListener('message', onMsg)
  }, [notes, gridSec])

  // New audio: build the buffers. Keep playing from the same spot (scaled for a new speed).
  useEffect(() => {
    const wasPlaying = playingRef.current
    const oldLength = buffersRef.current ? buffersRef.current.melody.length : 0
    const at = wasPlaying && ctxRef.current
      ? offsetRef.current + ctxRef.current.currentTime - startedAt.current
      : timeRef.current
    stopSources()
    playingRef.current = false
    setPlaying(false)

    if (!rendered) {
      buffersRef.current = null
      timeRef.current = 0
      setTime(0)
      return
    }
    const buffers = {} as Record<Voice, AudioBuffer>
    for (const v of VOICES) {
      const b = new AudioBuffer({ length: rendered.length, numberOfChannels: 2, sampleRate: SAMPLE_RATE })
      b.copyToChannel(rendered.stems[v].left as Float32Array<ArrayBuffer>, 0)
      b.copyToChannel(rendered.stems[v].right as Float32Array<ArrayBuffer>, 1)
      buffers[v] = b
    }
    buffersRef.current = buffers
    ctx()
    if (masterRef.current) masterRef.current.gain.value = rendered.peak > 0 ? 0.9 / rendered.peak : 1

    // Same image at a new speed: carry the position over. A new image: back to the start.
    const sameImage = oldLength > 0 && wasPlaying
    const next = sameImage ? (at * rendered.length) / oldLength : 0
    offsetRef.current = next
    timeRef.current = next
    setTime(next)
    if (sameImage) startAt(next)
  }, [rendered, startAt])

  // Reverb on/off, live.
  useEffect(() => {
    reverbRef.current = reverb
    const c = ctxRef.current
    if (c && wetRef.current) wetRef.current.gain.setTargetAtTime(reverb ? REVERB_WET : 0, c.currentTime, 0.05)
  }, [reverb])

  // Mutes apply instantly (short ramp so it doesn't click).
  useEffect(() => {
    mutedRef.current = muted
    const c = ctxRef.current
    if (!c || !gainsRef.current) return
    for (const v of VOICES) gainsRef.current[v].gain.setTargetAtTime(muted.has(v) ? 0 : 1, c.currentTime, 0.02)
  }, [muted])

  // Playhead clock.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const c = ctxRef.current
      if (c) {
        const t = offsetRef.current + c.currentTime - startedAt.current
        if (t >= duration) {
          stopSources()
          playingRef.current = false
          setPlaying(false)
          offsetRef.current = 0
          timeRef.current = 0
          setTime(0)
          setEnds((n) => n + 1)
          return
        }
        timeRef.current = t
        setTime(t)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, duration])

  useEffect(() => () => {
    stopSources()
    workerRef.current?.terminate()
    void ctxRef.current?.close()
  }, [])

  const toggle = useCallback(() => {
    if (!buffersRef.current) return
    if (playingRef.current) pause()
    else startAt(offsetRef.current)
  }, [pause, startAt])

  const seek = useCallback((sec: number) => {
    if (!buffersRef.current) return
    const t = Math.max(0, Math.min(sec, duration - 0.01))
    timeRef.current = t
    setTime(t)
    startAt(t)
  }, [duration, startAt])

  // What you hear, as a WAV: unmuted layers at the same loudness, through the same room.
  const exportWav = useCallback(async () => {
    if (!rendered) return null
    const tail = reverbRef.current ? Math.floor(2.4 * SAMPLE_RATE) : 0
    const off = new OfflineAudioContext(2, rendered.length + tail, SAMPLE_RATE)
    const master = off.createGain()
    master.gain.value = rendered.peak > 0 ? 0.9 / rendered.peak : 1
    master.connect(addReverb(off, off.destination, reverbRef.current).input)
    for (const v of VOICES) {
      if (mutedRef.current.has(v)) continue
      const b = off.createBuffer(2, rendered.length, SAMPLE_RATE)
      b.copyToChannel(rendered.stems[v].left as Float32Array<ArrayBuffer>, 0)
      b.copyToChannel(rendered.stems[v].right as Float32Array<ArrayBuffer>, 1)
      const src = off.createBufferSource()
      src.buffer = b
      src.connect(master)
      src.start()
    }
    const mix = await off.startRendering()
    return encodeWav(mix.getChannelData(0), mix.getChannelData(1), SAMPLE_RATE)
  }, [rendered])

  // Call from a click, so later (async) playback is allowed to make sound.
  const unlock = useCallback(() => void ctx().resume(), [])
  // False when the browser hasn't let us make sound yet (no click so far).
  const canPlay = useCallback(() => ctxRef.current?.state === 'running', [])

  return { ready: !!rendered && !rendering, rendering, playing, time, duration, ends, toggle, seek, exportWav, unlock, canPlay }
}
