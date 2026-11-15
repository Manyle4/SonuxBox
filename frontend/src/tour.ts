import type { AnalyzeResult } from './api'
import { describeSeries, strongestSentence } from './describe'
import { TRACKS, type Track } from './tracks'

// A guided listen: a few words, then the track, then on to the next.
export interface TourStep {
  key: string // narration recording name
  track?: string // track to play after the words
  intro: string
}

export const TOUR: TourStep[] = [
  {
    key: 'tour.0',
    intro:
      "Welcome to SonuxBox, an Earth Jukebox. Every sound here is made from a NASA image of our planet. " +
      'Each image is read from left to right, like sheet music. Where the signal sits higher in the image, ' +
      'the melody plays higher notes, and where there is more going on, it gets louder. Let’s listen.',
  },
  { key: 'tour.1', track: 'co', intro: 'First, carbon monoxide from fires and pollution.' },
  { key: 'tour.2', track: 'aerosol', intro: 'Next, aerosols: dust, smoke and sea salt carried by the wind.' },
  { key: 'tour.3', track: 'lightning', intro: 'Now lightning, seen from the International Space Station. Sudden bursts of storms come through as drum hits.' },
  { key: 'tour.4', track: 'ukraine', intro: 'Finally, a time-lapse: night lights over Ukraine in 2012, then 2023.' },
  {
    key: 'tour.5',
    intro:
      'That’s the tour. You can explore any image yourself: hover over it, drag a finger across it, ' +
      'or use the arrow keys to hear one slice at a time. Or upload your own image. Thanks for listening.',
  },
]

export const tourTrack = (step: TourStep): Track | undefined => TRACKS.find((t) => t.id === step.track)

// The words for a step, with a fact taken from the track's own data.
export function tourText(step: TourStep, results: AnalyzeResult[] | null, labels: string[]) {
  const track = tourTrack(step)
  if (!track || !results) return step.intro
  const fact =
    results.length > 1
      ? describeSeries(results.map((r, i) => ({ result: r, label: labels[i] })), track.title).split('. ').slice(-1)[0]
      : strongestSentence(results[0], track.geo)
  return `${step.intro} ${fact}`
}
