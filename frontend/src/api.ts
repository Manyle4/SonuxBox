// Talks to the SonuxBox engine (the C++ server on Heroku).

export const API_URL = (
  import.meta.env.VITE_API_URL ?? 'https://sonuxbox-api-285f8ea04b1d.herokuapp.com'
).replace(/\/$/, '')

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export type AnalysisMode = 'adaptive' | 'terrain'
export type Voice = 'melody' | 'bass' | 'pad' | 'perc' | 'pluck' | 'bell'

export interface Note {
  start: number // seconds
  dur: number
  midi: number // 0 for percussion
  vel: number // 0..1
  voice: Voice
  pos?: number // 0..1 across its image, for stereo panning (set when frames are joined)
}

export interface ColumnStat {
  land: number // signal strength in adaptive mode
  ocean: number // quiet share in adaptive mode
  landPos: number // 0 = bottom, 1 = top
  peakPos?: number // height of the strongest band (newer engine only)
}

export interface Layer {
  color: string // e.g. "purple"
  hex: string
  share: number // of the signal
  voice: 'pluck' | 'bell'
}

export interface AnalyzeResult {
  image: string
  audioUrl: string
  analysisMode: AnalysisMode
  scale: string
  bpm: number
  rootMidi: number
  imageWidth: number
  imageHeight: number
  cropBottom: number // bottom share of the image the engine ignores (legends)
  cropTop?: number // top share it ignores (logos); newer engine only
  columns: number
  stepSec: number
  musicSec: number // last note lets go here
  durationSec: number // includes the fade-out tail
  share: Record<string, number>
  columnStats: ColumnStat[]
  layers?: Layer[] // colour layers with their own instrument (adaptive mode, newer engine)
  notes: Note[]
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.error === 'string') return body.error
  } catch {
    // not JSON, fall through
  }
  return `Server error (${res.status})`
}

export async function analyze(
  file: Blob, name: string, mode: AnalysisMode, crop?: number, signal?: AbortSignal, cropTop?: number,
) {
  const form = new FormData()
  form.append('image', file, name)
  form.append('mode', mode)
  if (crop !== undefined) form.append('crop', String(crop))
  if (cropTop !== undefined) form.append('cropTop', String(cropTop))

  const res = await fetch(`${API_URL}/api/analyze`, { method: 'POST', body: form, signal })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as AnalyzeResult
}

// Same piece at a different speed: every time stretches by 1/rate.
export function atSpeed(r: AnalyzeResult, rate: number): AnalyzeResult {
  if (rate === 1) return r
  return {
    ...r,
    bpm: r.bpm * rate,
    stepSec: r.stepSec / rate,
    musicSec: r.musicSec / rate,
    durationSec: r.durationSec / rate,
    notes: r.notes.map((n) => ({ ...n, start: n.start / rate, dur: n.dur / rate })),
  }
}
