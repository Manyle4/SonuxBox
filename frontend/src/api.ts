// Talks to the SonuxBox engine (the C++ server on Heroku).

export const API_URL = (
  import.meta.env.VITE_API_URL ?? 'https://sonuxbox-api-285f8ea04b1d.herokuapp.com'
).replace(/\/$/, '')

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export type AnalysisMode = 'adaptive' | 'terrain'
export type Voice = 'melody' | 'bass' | 'pad'

export interface Note {
  start: number // seconds
  dur: number
  midi: number
  vel: number // 0..1
  voice: Voice
}

export interface ColumnStat {
  land: number // signal strength in adaptive mode
  ocean: number // quiet share in adaptive mode
  landPos: number // 0 = bottom, 1 = top
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
  columns: number
  stepSec: number
  musicSec: number // last note lets go here
  durationSec: number // includes the fade-out tail
  share: Record<string, number>
  columnStats: ColumnStat[]
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

export async function analyze(file: Blob, name: string, mode: AnalysisMode, signal?: AbortSignal) {
  const form = new FormData()
  form.append('image', file, name)
  form.append('mode', mode)

  const res = await fetch(`${API_URL}/api/analyze`, { method: 'POST', body: form, signal })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as AnalyzeResult
}

// Grab the WAV right away: Heroku wipes its disk on restarts, so the URL won't last.
export async function fetchAudio(audioUrl: string, signal?: AbortSignal) {
  const res = await fetch(`${API_URL}${audioUrl}`, { signal })
  if (!res.ok) throw new Error(await readError(res))
  return res.blob()
}
