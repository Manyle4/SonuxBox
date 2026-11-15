import type { AnalyzeResult, Layer, Note } from './api'
import { placeOf, type Geo } from './geo'

// What a track knows about its image, beyond the pixels.
export interface TrackInfo {
  geo?: Geo // map edges, for naming places
  measure?: { label: string; unit: string } // what the colour scale measures
  categories?: { hex: string; name: string }[] // named colours from the image's legend
}

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
export const placeAt = (r: AnalyzeResult, col: number, info?: TrackInfo) =>
  info?.geo ? placeOf(info.geo, col, r.columns, r.columnStats[col].peakPos ?? r.columnStats[col].landPos, r.cropBottom, r.cropTop) : null

// Short line for the explore slider and live captions, read out by screen readers.
export function describeColumn(r: AnalyzeResult, col: number, info?: TrackInfo) {
  const c = columnInfo(r, col)
  const word = c.rest ? 'little' : c.strength >= 0.7 ? 'strong' : 'some'
  const place = placeAt(r, col, info)
  const reading = valueAt(r, col, info)
  const base = `${place ? `${cap(place)}, slice` : 'Slice'} ${col + 1} of ${r.columns}: ${word} signal`
  const tail = reading ? `, ${info!.measure!.label} ${reading}` : ''
  if (!c.melody) return `${base}, rest${tail}`
  return `${base}, ${height(r.columnStats[col].landPos)}, note ${noteName(c.melody.midi)}${tail}`
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

// The 2-3 regions with the most signal in a stretch of slices, in left-to-right order.
function mainPlaces(r: AnalyzeResult, infos: ColumnInfo[], from: number, to: number, info: TrackInfo) {
  const score = new Map<string, { total: number; first: number }>()
  for (let c = from; c <= to; c++) {
    const p = placeAt(r, c, info)!
    const e = score.get(p) ?? { total: 0, first: c }
    e.total += infos[c].strength
    score.set(p, e)
  }
  const top = [...score.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 3)
  const names = top.sort((a, b) => a[1].first - b[1].first).map(([p]) => p)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
}

// One line on where the signal peaks, for the tour.
export function strongestSentence(r: AnalyzeResult, info?: TrackInfo) {
  const infos = r.columnStats.map((_, i) => columnInfo(r, i))
  const peak = infos.reduce((top, c, i) => (c.strength > infos[top].strength ? i : top), 0)
  const p = placeAt(r, peak, info)
  return `Listen for the loudest moment, about ${secs(peak * r.stepSec)} in: that's ${p ? `over ${p}` : `${across(peak, r.columns)} of the image`}, where the signal is strongest.`
}

// A reading off the image's colour scale, e.g. "about 24 °C".
export function valueAt(r: AnalyzeResult, col: number, info?: TrackInfo) {
  const v = r.columnStats[col].value
  return info?.measure && v != null ? `about ${Math.round(v)} ${info.measure.unit}` : null
}

// Coolest and warmest (or lowest and highest) readings across the image.
function rangeSentence(r: AnalyzeResult, info: TrackInfo | undefined, where: (col: number) => string) {
  if (!info?.measure) return ''
  const cols = r.columnStats.map((c, i) => ({ v: c.value, i })).filter((c): c is { v: number; i: number } => c.v != null)
  if (cols.length < 2) return ''
  const lo = cols.reduce((a, b) => (b.v < a.v ? b : a))
  const hi = cols.reduce((a, b) => (b.v > a.v ? b : a))
  const u = info.measure.unit
  return `${cap(info.measure.label)} runs from about ${Math.round(lo.v)} ${u} ${where(lo.i)} to about ${Math.round(hi.v)} ${u} ${where(hi.i)}.`
}

// A layer's name: the legend's word for its colour when the image has one (e.g. "dust").
// Matched by hue, since a layer's average colour is often a darker, greyer shade of the swatch.
export function layerName(l: Layer, info?: TrackInfo) {
  const hsv = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    let h = 0
    if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0 }
  }
  const mine = hsv(l.hex)
  if (mine.s < 0.1) return l.color
  let best: { name: string; d: number } | null = null
  for (const c of info?.categories ?? []) {
    const theirs = hsv(c.hex)
    const gap = Math.abs(mine.h - theirs.h)
    const d = Math.min(gap, 360 - gap)
    if (d < 35 && (!best || d < best.d)) best = { name: c.name, d }
  }
  return best ? best.name : l.color
}

// Which colours got their own instrument (only those that actually play).
function layerSentence(r: AnalyzeResult, info?: TrackInfo) {
  const playing = (r.layers ?? []).filter((l) => r.notes.some((n) => n.voice === l.voice))
  if (!playing.length) return ''
  const parts = playing.map((l) => `the ${layerName(l, info)} areas play ${l.voice === 'bell' ? 'bells' : 'a soft pluck'}`)
  return `Each colour has its own instrument: ${parts.join(', and ')}.`
}

// Compare mode: two images played together, one per ear, slice by slice.
export function describeCompare(a: AnalyzeResult, b: AnalyzeResult, titleA: string, titleB: string, infoA?: TrackInfo) {
  const ia = a.columnStats.map((_, i) => columnInfo(a, i))
  const ib = b.columnStats.map((_, i) => columnInfo(b, i))
  const both = ia.map((c, i) => c.strength >= 0.6 && ib[i].strength >= 0.6)
  const places = [...new Set(both.flatMap((on, i) => (on ? [placeAt(a, i, infoA) ?? across(i, a.columns)] : [])))]
  const count = both.filter(Boolean).length
  return [
    `${titleA} plays in your left ear and ${titleB} in your right, slice by slice at the same pace.`,
    count === 0
      ? 'They are rarely strong at the same time, so the two ears mostly take turns.'
      : `Both are strong together in ${count} of ${a.columns} slices${places.length ? `, around ${places.slice(0, 3).join(', ')}` : ''}: listen for both ears getting loud at once.`,
  ].join(' ')
}

// A few sentences describing the whole piece, built from the same numbers that made the music.
export function describePiece(r: AnalyzeResult, title: string, info?: TrackInfo) {
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
    const p = placeAt(r, col, info)
    return p ? `over ${p}` : `at ${across(col, r.columns)}`
  }
  const sentences = [
    `${title} plays for about ${secs(r.musicSec)}, in ${r.scale} at ${Math.round(r.bpm)} beats per minute.`,
    'The image is read from left to right, one slice per beat.',
    best.to >= best.from
      ? (info?.geo
          ? `The melody is busiest over ${mainPlaces(r, infos, best.from, best.to, info)} `
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
    rangeSentence(r, info, where),
    layerSentence(r, info),
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
