// A straight port of the engine's synth (src/synth.h), so the browser sounds the same,
// plus stereo: each sound is panned by where it sits across the image.
import type { Note, Voice } from '../api'

export const VOICES: Voice[] = ['melody', 'bass', 'pad', 'perc']

interface Instrument {
  attack: number
  decay: number
  sustain: number
  release: number
  harmonics: number[] // loudness of the 1st, 2nd, ... overtone
  unison: number // detuned copies layered together
  detuneCents: number
  vibrato: number // pitch wobble depth (fraction of the frequency)
  gain: number
}

// Same numbers as instrumentFor() in synth.h.
const INSTRUMENTS: Record<Voice, Instrument> = {
  melody: { attack: 0.015, decay: 0.1, sustain: 0.75, release: 0.3, harmonics: [1, 0.3, 0.12], unison: 1, detuneCents: 0, vibrato: 0.004, gain: 0.3 },
  bass: { attack: 0.04, decay: 0.1, sustain: 0.85, release: 0.5, harmonics: [1, 0.5, 0.25, 0.1], unison: 1, detuneCents: 0, vibrato: 0, gain: 0.32 },
  pad: { attack: 0.7, decay: 0.3, sustain: 0.85, release: 1.4, harmonics: [1, 0.5, 0.33, 0.25], unison: 3, detuneCents: 7, vibrato: 0, gain: 0.09 },
  perc: { attack: 0.001, decay: 0, sustain: 1, release: 0, harmonics: [], unison: 1, detuneCents: 0, vibrato: 0, gain: 0.22 },
}

const TWO_PI = Math.PI * 2
const VIBRATO_RATE = 5.5
// How far sounds pan: melody and drums follow the image closely, bass and pad stay nearer the middle.
const PAN_WIDTH: Record<Voice, number> = { melody: 0.85, perc: 0.85, bass: 0.35, pad: 0.35 }

const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

function adsr(t: number, dur: number, i: Instrument): number {
  if (t < 0) return 0
  if (t < dur) {
    if (t < i.attack) return t / i.attack
    if (t < i.attack + i.decay) return 1 - (1 - i.sustain) * ((t - i.attack) / i.decay)
    return i.sustain
  }
  const r = t - dur
  if (r >= i.release) return 0
  return adsr(dur * 0.999999, dur, i) * (1 - r / i.release)
}

export interface Stem {
  left: Float32Array
  right: Float32Array
}

export interface RenderResult {
  stems: Record<Voice, Stem>
  length: number // samples
  peak: number // loudest sample of the full mix, before scaling
}

// gridSec = how long the image takes to cross; used to pan by position.
export function renderStems(notes: Note[], sampleRate: number, gridSec: number): RenderResult {
  let endSec = 0
  for (const n of notes) endSec = Math.max(endSec, n.start + n.dur + INSTRUMENTS[n.voice].release)
  const length = Math.floor(endSec * sampleRate) + 1

  const stems = {} as Record<Voice, Stem>
  for (const v of VOICES) stems[v] = { left: new Float32Array(length), right: new Float32Array(length) }

  for (const n of notes) {
    const inst = INSTRUMENTS[n.voice]
    const stem = stems[n.voice]
    // Equal-power pan from where the note starts across the image (-1 left .. +1 right).
    const across = n.pos ?? (gridSec > 0 ? n.start / gridSec : 0.5) // gridSec 0 = no panning
    const pos = Math.min(Math.max(across, 0), 1) * 2 - 1
    const angle = ((pos * PAN_WIDTH[n.voice] + 1) * Math.PI) / 4
    const gl = Math.cos(angle)
    const gr = Math.sin(angle)
    const first = Math.floor(n.start * sampleRate)

    if (n.voice === 'perc') {
      renderHit(stem, n, inst, sampleRate, first, gl, gr)
      continue
    }

    const base = midiToFreq(n.midi)
    const freqs: number[] = []
    for (let u = 0; u < inst.unison; u++) {
      const p = inst.unison === 1 ? 0 : (2 * u) / (inst.unison - 1) - 1
      freqs.push(base * 2 ** ((p * inst.detuneCents) / 1200))
    }
    const perCopy = (inst.gain * n.vel) / inst.unison
    const count = Math.floor((n.dur + inst.release) * sampleRate)

    for (let i = 0; i < count && first + i < length; i++) {
      const t = i / sampleRate
      const env = adsr(t, n.dur, inst)
      if (env <= 0) continue
      const wobble = Math.sin(TWO_PI * VIBRATO_RATE * t) * Math.min(1, t / 0.4)
      let s = 0
      for (const f of freqs) {
        const phase = TWO_PI * f * t + ((inst.vibrato * f) / VIBRATO_RATE) * wobble
        for (let h = 0; h < inst.harmonics.length; h++) s += inst.harmonics[h] * Math.sin((h + 1) * phase)
      }
      const v = s * perCopy * env
      stem.left[first + i] += v * gl
      stem.right[first + i] += v * gr
    }
  }

  // Peak of the whole mix, so every image ends up equally loud (the engine aims for 0.9).
  let peak = 0
  for (let i = 0; i < length; i++) {
    let l = 0
    let r = 0
    for (const v of VOICES) {
      l += stems[v].left[i]
      r += stems[v].right[i]
    }
    peak = Math.max(peak, Math.abs(l), Math.abs(r))
  }
  return { stems, length, peak }
}

// Noise click over a low thump, same recipe (and seed) as renderHit() in synth.h.
function renderHit(stem: Stem, n: Note, inst: Instrument, sampleRate: number, first: number, gl: number, gr: number) {
  const count = Math.floor(n.dur * sampleRate)
  let seed = (12345 + first) >>> 0
  for (let i = 0; i < count && first + i < stem.left.length; i++) {
    const t = i / sampleRate
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = (seed >>> 8) / 8388608 - 1
    const thump = Math.sin(TWO_PI * (55 + 60 * Math.exp(-t * 40)) * t)
    const v = (0.35 * noise * Math.exp(-t * 60) + thump * Math.exp(-t * 18)) * inst.gain * n.vel
    stem.left[first + i] += v * gl
    stem.right[first + i] += v * gr
  }
}
