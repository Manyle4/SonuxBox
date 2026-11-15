import type { AnalyzeResult, Note } from './api'
import { placeOf, type Geo } from './geo'

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`

const across = (col: number, columns: number) => {
  const x = col / (columns - 1)
  if (x < 0.15) return 'the far left'
  if (x < 0.4) return 'the left'
  if (x < 0.6) return 'the middle'
  if (x < 0.85) return 'the right'
  return 'the far right'
}

const height = (landPos: number) =>
  landPos > 0.62 ? 'near the top' : landPos < 0.38 ? 'near the bottom' : 'around mid-height'

const secs = (s: number) => `${Math.round(s)} s`

export interface ColumnInfo {
  strength: number // 0..1, relative to the strongest column
  rest: boolean
  melody: Note | null
  bass: Note | null
}

// What's playing in one column. Matched by rounding to whole beats, since the
// JSON's stepSec is rounded and multiplying it up drifts by a few ms.
export function columnInfo(r: AnalyzeResult, col: number): ColumnInfo {
  const max = Math.max(...r.columnStats.map((c) => c.land), 1e-6)
  const strength = r.columnStats[col].land / max
  const at = (voice: Note['voice']) =>
    r.notes.find((n) => {
      if (n.voice !== voice) return false
      const first = Math.round(n.start / r.stepSec)
      const beats = Math.max(1, Math.round(n.dur / r.stepSec)) // a held note spans several
      return first <= col && col < first + beats
    }) ?? null
  const melody = at('melody')
  // The notes are the truth: rounded JSON numbers can't always reproduce the engine's cutoff.
  return { strength, rest: !melody, melody, bass: at('bass') }
}

// Region name for a slice, or null when the image isn't a known world map.
export const placeAt = (r: AnalyzeResult, col: number, geo?: Geo) =>
  geo ? placeOf(geo, col, r.columns, r.columnStats[col].peakPos ?? r.columnStats[col].landPos, r.cropBottom) : null

// Short line for the explore slider and live captions, read out by screen readers.
export function describeColumn(r: AnalyzeResult, col: number, geo?: Geo) {
  const info = columnInfo(r, col)
  const word = info.rest ? 'little' : info.strength >= 0.7 ? 'strong' : 'some'
  const place = placeAt(r, col, geo)
  const base = `${place ? `${cap(place)}, slice` : 'Slice'} ${col + 1} of ${r.columns}: ${word} signal`
  if (!info.melody) return `${base}, rest`
  return `${base}, ${height(r.columnStats[col].landPos)}, note ${noteName(info.melody.midi)}`
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

// A few sentences describing the whole piece, built from the same numbers that made the music.
export function describePiece(r: AnalyzeResult, title: string, geo?: Geo) {
  const cols = r.columnStats
  const infos = cols.map((_, i) => columnInfo(r, i))
  const restCount = infos.filter((c) => c.rest).length
  const hits = r.notes.filter((n) => n.voice === 'perc').length

  // Longest run of sounding columns = the busiest stretch of the map.
  let best = { from: 0, to: -1 }
  let start = -1
  infos.forEach((c, i) => {
    if (!c.rest && start < 0) start = i
    if ((c.rest || i === infos.length - 1) && start >= 0) {
      const end = c.rest ? i - 1 : i
      if (end - start > best.to - best.from) best = { from: start, to: end }
      start = -1
    }
  })

  const peak = infos.reduce((top, c, i) => (c.strength > infos[top].strength ? i : top), 0)
  const melody = r.notes.filter((n) => n.voice === 'melody')
  const highest = melody.reduce<Note | null>((top, n) => (!top || n.midi > top.midi ? n : top), null)
  const highCol = highest ? Math.min(Math.floor(highest.start / r.stepSec), r.columns - 1) : peak

  // With a world map, say where; otherwise say where across the image.
  const where = (col: number) => {
    const p = placeAt(r, col, geo)
    return p ? `over ${p}` : `at ${across(col, r.columns)}`
  }
  const sentences = [
    `${title}, played as a ${secs(r.musicSec)} piece in ${r.scale} at ${Math.round(r.bpm)} beats per minute.`,
    'The image is read from left to right, one slice per beat.',
    best.to >= best.from
      ? (geo
          ? `The melody is busiest from ${placeAt(r, best.from, geo)} to ${placeAt(r, best.to, geo)} `
          : `The melody is busiest from ${across(best.from, r.columns)} to ${across(best.to, r.columns)} of the image `) +
        `(about ${secs(best.from * r.stepSec)} to ${secs((best.to + 1) * r.stepSec)} in).`
      : 'The image has very little signal, so the melody is sparse.',
    `The strongest signal is ${where(peak)}, around ${secs(peak * r.stepSec)} in, where the melody is loudest.`,
    highest
      ? `Its highest note, ${noteName(highest.midi)}, comes ${where(highCol)}, where the signal sits ${height(cols[highCol].landPos)} of the image.`
      : '',
    restCount > 0
      ? `About ${Math.round((restCount / r.columns) * 100)}% of the slices are quiet enough that the melody rests.`
      : 'There is signal in every slice, so the melody never rests.',
    'A bass note and soft chords hold each bar together underneath.',
    hits > 0
      ? `${hits} drum ${hits === 1 ? 'hit marks' : 'hits mark'} places where the signal jumps up suddenly.`
      : '',
  ]
  return sentences.filter(Boolean).join(' ')
}

// Time-lapse: compare the frames, since the change is the point.
export function describeSeries(frames: { result: AnalyzeResult; label: string }[], title: string) {
  const stats = frames.map((f) => {
    const land = f.result.columnStats.map((c) => c.land)
    return {
      label: f.label,
      scale: f.result.scale,
      mean: land.reduce((a, b) => a + b, 0) / land.length,
      melody: f.result.notes.filter((n) => n.voice === 'melody').length,
    }
  })
  const first = stats[0]
  const last = stats[stats.length - 1]
  const change = first.mean > 0 ? ((last.mean - first.mean) / first.mean) * 100 : 0

  return [
    `${title}: ${frames.length} images played back to back, ${stats.map((s) => s.label).join(', then ')}.`,
    'Each one is read left to right, one slice per beat.',
    ...stats.map((s) => `${s.label} plays in ${s.scale} with ${s.melody} melody notes.`),
    Math.abs(change) < 2
      ? `Overall, the signal barely changes from ${first.label} to ${last.label}.`
      : `From ${first.label} to ${last.label} the overall signal ${change > 0 ? 'rises' : 'falls'} by about ` +
        `${Math.round(Math.abs(change))}%, and the melody goes from ${first.melody} to ${last.melody} notes.`,
  ].join(' ')
}
