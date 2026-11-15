// What the jukebox can play next: a jukebox record, or a live NASA day.
import { daysAgo, LIVE_LAYERS, prettyDate } from './live'
import { TRACKS } from './tracks'

export type QItem =
  | { kind: 'track'; id: string }
  | { kind: 'live'; layer: string; date: string; then?: string }

export const itemKey = (q: QItem) => (q.kind === 'track' ? `t:${q.id}` : `l:${q.layer}:${q.date}:${q.then ?? ''}`)

// Selection codes, like a real jukebox: A1, A2, A3, B1, ... three to a row.
export const codeOf = (i: number) => `${String.fromCharCode(65 + Math.floor(i / 3))}${(i % 3) + 1}`
export const CODES = TRACKS.map((t, i) => ({ code: codeOf(i), track: t }))
export const trackByCode = (code: string) => CODES.find((c) => c.code === code.toUpperCase())?.track ?? null
export const codeOfTrack = (id: string) => CODES.find((c) => c.track.id === id)?.code ?? null

// "Sea temperature · 12 Nov"
const shortDate = (d: string) => prettyDate(d).replace(/ \d{4}$/, '').replace(/(\w{3})\w*$/, '$1')
export function itemLabel(q: QItem) {
  if (q.kind === 'track') return TRACKS.find((t) => t.id === q.id)?.title ?? q.id
  const title = LIVE_LAYERS.find((l) => l.id === q.layer)?.title ?? q.layer
  return `${title} · ${q.then ? `${shortDate(q.then)} → ` : ''}${shortDate(q.date)}`
}

export function shuffled<T>(xs: T[], rand = Math.random) {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const ALL_TRACKS: QItem[] = TRACKS.map((t) => ({ kind: 'track', id: t.id }))

// Stations: endless playlists of live NASA data. When one runs out it starts again,
// worked out fresh so it moves on with the calendar.
export interface Station {
  id: string
  title: string
  blurb: string
  items: (today?: Date) => QItem[]
}

const layer = (id: string) => LIVE_LAYERS.find((l) => l.id === id)!
const lastDays = (id: string, n: number, today?: Date): QItem[] =>
  Array.from({ length: n }, (_, i) => ({ kind: 'live', layer: id, date: daysAgo(layer(id).lagDays + n - 1 - i, today) }))

export const STATIONS: Station[] = [
  { id: 'ocean', title: 'Ocean radio', blurb: '30 days of sea temperature', items: (t) => lastDays('sst', 30, t) },
  { id: 'storm', title: 'Storm watch', blurb: 'The last week of rain and snow', items: (t) => lastDays('rain', 7, t) },
  {
    id: 'week',
    title: 'This week on Earth',
    blurb: 'Every live layer, newest day',
    items: (t) => LIVE_LAYERS.map((l) => ({ kind: 'live', layer: l.id, date: daysAgo(l.lagDays, t) })),
  },
]
