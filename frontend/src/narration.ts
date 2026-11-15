import type { AnalysisMode, AnalyzeResult } from './api'
import { describePiece, describeSeries } from './describe'
import { TOUR, tourText, tourTrack } from './tour'
import { framesOf, type Track } from './tracks'
import { keyPhrase, phraseKey, soundKey } from './soundKey'

// The words read out for a piece. The page and the narration build both use this,
// so the recorded voice always says what's on screen.
export function narrationText(track: Track | null, title: string, results: AnalyzeResult[], labels: string[]) {
  const description =
    results.length > 1
      ? describeSeries(results.map((r, i) => ({ result: r, label: labels[i] })), title)
      : describePiece(results[0], title, track ?? undefined)
  return [track ? `${track.about} ${track.listen}` : '', description].filter(Boolean).join(' ')
}

// Symbols a voice would stumble over.
export function speakable(text: string) {
  return text
    .replace(/([A-G])[#♯]/g, '$1 sharp')
    .replace(/\s*→\s*/g, ' to ')
    .replace(/CO₂/g, 'C O 2')
    .replace(/(\d+) s\b/g, '$1 seconds')
    .replace(/\s+/g, ' ')
    .trim()
}

// FNV-1a, so a recording can be matched to the exact text it was made from.
export function textHash(text: string) {
  let h = 0x811c9dc5
  for (const ch of new TextEncoder().encode(text)) {
    h ^= ch
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export const narrationKey = (track: Track, mode: AnalysisMode) => `${track.id}.${mode}`

// Every track in both modes, from the pre-rendered results. Used by the build.
export function allNarrations(load: (frameId: string, mode: AnalysisMode) => AnalyzeResult, tracks: Track[]) {
  const out: Record<string, string> = {}
  for (const t of tracks) {
    for (const mode of ['adaptive', 'terrain'] as const) {
      const frames = framesOf(t)
      const results = frames.map((f) => load(f.id, mode))
      out[narrationKey(t, mode)] = speakable(narrationText(t, t.title, results, frames.map((f) => f.label)))
      // Sound key phrases, shared between tracks.
      for (const r of results) for (const it of soundKey(r, t)) out[phraseKey(keyPhrase(it))] = speakable(keyPhrase(it))
    }
  }
  // Tour steps play each track in its own default mode.
  for (const step of TOUR) {
    const t = tourTrack(step)
    const frames = t ? framesOf(t) : []
    const results = t ? frames.map((f) => load(f.id, t.mode)) : null
    out[step.key] = speakable(tourText(step, results, frames.map((f) => f.label)))
  }
  return out
}
