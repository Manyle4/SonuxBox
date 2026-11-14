import type { AnalysisMode, AnalyzeResult } from './api'
import list from './tracks.json'

export interface Track {
  id: string
  title: string
  about: string // what the data shows
  listen: string // what to listen for
  mode: AnalysisMode // the mode that suits this image best
  crop?: number // share of the bottom to ignore; 0 for images with no legend strip
  source: { label: string; url: string }
}

// Frames from NASA's Earth Information Center visuals, made by the Scientific
// Visualization Studio (SVS). The list lives in tracks.json so the prerender script can read it.
export const TRACKS = list as Track[]

export const trackUrl = (id: string) => `/samples/${id}.jpg`

// Results made ahead of time by `npm run prerender`, so the jukebox works without the API.
export async function prerendered(id: string, mode: AnalysisMode): Promise<AnalyzeResult | null> {
  try {
    const res = await fetch(`/tracks/${id}.${mode}.json`)
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
    return (await res.json()) as AnalyzeResult
  } catch {
    return null
  }
}
