import type { AnalyzeResult } from './api'

export interface Segment {
  start: number // where this frame starts in the joined piece (s)
  end: number
  result: AnalyzeResult
  label: string
  imageUrl: string
}

export interface Joined {
  piece: AnalyzeResult // all frames' notes on one timeline, for the player and piano roll
  segments: Segment[]
}

const GAP = 0.6 // breath between frames (s)

// Plays frames one after another. Each note keeps its place across its own image for panning.
export function joinFrames(frames: { result: AnalyzeResult; label: string; imageUrl: string }[]): Joined {
  const segments: Segment[] = []
  const notes: AnalyzeResult['notes'] = []
  let offset = 0
  for (const f of frames) {
    const r = f.result
    const grid = r.columns * r.stepSec
    const end = offset + Math.max(r.musicSec, grid)
    for (const n of r.notes) notes.push({ ...n, start: n.start + offset, pos: n.start / grid })
    segments.push({ start: offset, end, result: r, label: f.label, imageUrl: f.imageUrl })
    offset = end + GAP
  }

  const first = frames[0].result
  if (frames.length === 1) return { piece: { ...first, notes }, segments }

  const scales = [...new Set(frames.map((f) => f.result.scale))]
  const last = segments.at(-1)!
  return {
    piece: {
      ...first,
      scale: scales.join(' → '),
      columns: 0, // no single grid across frames
      musicSec: last.end,
      durationSec: last.end,
      notes,
    },
    segments,
  }
}

// Which frame is playing at time t.
export function segmentAt(segments: Segment[], t: number) {
  let i = 0
  while (i + 1 < segments.length && t >= segments[i + 1].start) i++
  return i
}
