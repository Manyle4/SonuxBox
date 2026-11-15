import type { AnalysisMode, AnalyzeResult } from './api'
import type { TrackInfo } from './describe'
import list from './tracks.json'

export interface Track extends TrackInfo {
  id: string
  title: string
  about: string // what the data shows
  listen: string // what to listen for
  mode: AnalysisMode // the mode that suits this image best
  crop?: number // share of the bottom to ignore; 0 for images with no legend strip
  cropTop?: number // share of the top to ignore (e.g. the NASA/GMAO logo)
  source: { label: string; url: string }
  frames?: { id: string; label: string }[] // a time-lapse: images played one after another
  scale?: string // the image's colour bar as "#rrggbb:value;...", sent to the engine
  live?: { layer: string; date: string; then?: string } // a live NASA GIBS map, not a jukebox image
  data?: { from: string; when: string } // instrument/model and period, for the "About this data" panel
}

// Frames from NASA's Earth Information Center visuals, made by the Scientific
// Visualization Studio (SVS). The list lives in tracks.json so the prerender script can read it.
export const TRACKS = list as Track[]

export const imageUrl = (id: string) => `/samples/${id}.jpg`

// The images a track plays: one, or several for a time-lapse.
export const framesOf = (t: Track) => t.frames ?? [{ id: t.id, label: '' }]

// Thumbnail: the last frame of a time-lapse.
export const trackUrl = (t: Track) => imageUrl(framesOf(t).at(-1)!.id)

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
