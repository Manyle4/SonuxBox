// The sound key: like a map's colour bar, but for the ears. Each entry is a short
// sample taken from the piece itself, with what it means.
import type { AnalyzeResult, Note, Voice } from './api'
import { layerName, type TrackInfo } from './describe'
import { textHash, speakable } from './narration'

export interface KeyItem {
  id: string
  name: string // "Low note"
  meaning: string // "the signal sits towards the south"
  voice: Voice // for the colour dot
  hex?: string // colour layers: the layer's colour
  notes: Note[] // the sample, starting at 0
}

const sample = (n: Note, dur = 0.6): Note => ({ ...n, start: 0, dur, pan: 0 })

export function soundKey(r: AnalyzeResult, info?: TrackInfo): KeyItem[] {
  const melody = r.notes.filter((n) => n.voice === 'melody')
  if (!melody.length) return []
  const byPitch = [...melody].sort((a, b) => a.midi - b.midi)
  const byVel = [...melody].sort((a, b) => a.vel - b.vel)
  const mid = byPitch[Math.floor(byPitch.length / 2)]
  const map = !!info?.geo
  const items: KeyItem[] = []

  const low = byPitch[0], high = byPitch.at(-1)!
  if (high.midi > low.midi) {
    items.push(
      { id: 'low', name: 'Low note', meaning: map ? 'the signal sits towards the south' : 'the signal sits low in the image', voice: 'melody', notes: [sample({ ...low, vel: mid.vel })] },
      { id: 'high', name: 'High note', meaning: map ? 'the signal sits towards the north' : 'the signal sits high in the image', voice: 'melody', notes: [sample({ ...high, vel: mid.vel })] },
    )
  }
  const soft = byVel[0], loud = byVel.at(-1)!
  if (loud.vel - soft.vel > 0.1) {
    items.push(
      { id: 'soft', name: 'Soft', meaning: 'weak signal', voice: 'melody', notes: [sample({ ...mid, vel: soft.vel })] },
      { id: 'loud', name: 'Loud', meaning: 'strong signal', voice: 'melody', notes: [sample({ ...mid, vel: loud.vel })] },
    )
  }
  items.push({ id: 'rest', name: 'Silence', meaning: 'little or no signal, so the melody rests', voice: 'melody', notes: [] })

  // Bass and chords from the first bar, played together.
  const bass = r.notes.find((n) => n.voice === 'bass')
  if (bass) {
    const chord = r.notes.filter((n) => n.voice === 'pad' && Math.abs(n.start - bass.start) < 0.01)
    items.push({
      id: 'harmony', name: 'Bass and chords', meaning: 'the key of the piece, holding each bar together', voice: 'bass',
      notes: [sample(bass, 1.2), ...chord.map((n) => sample(n, 1.2))],
    })
  }
  const hit = r.notes.find((n) => n.voice === 'perc')
  if (hit) items.push({ id: 'perc', name: 'Drum hit', meaning: 'the signal jumps up suddenly', voice: 'perc', notes: [sample(hit, hit.dur)] })

  for (const l of r.layers ?? []) {
    const n = r.notes.find((x) => x.voice === l.voice)
    if (!n) continue
    items.push({
      id: l.voice, name: l.voice === 'bell' ? 'Bell' : 'Pluck', meaning: `${layerName(l, info)} areas`,
      voice: l.voice, hex: l.hex, notes: [sample(n, 0.5)],
    })
  }
  return items
}

export const keyPhrase = (it: KeyItem) => `${it.name}: ${it.meaning}.`

// Recordings of key phrases are named by their text, since the same phrase turns up in many tracks.
export const phraseKey = (text: string) => `p-${textHash(speakable(text))}`
