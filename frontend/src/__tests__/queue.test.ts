import { describe, expect, it } from 'vitest'
import { ALL_TRACKS, CODES, codeOf, codeOfTrack, itemKey, itemLabel, shuffled, STATIONS, trackByCode } from '../queue'
import { TRACKS } from '../tracks'

describe('selection codes', () => {
  it('run A1, A2, A3, B1, ... three to a row', () => {
    expect([0, 1, 2, 3, 11].map(codeOf)).toEqual(['A1', 'A2', 'A3', 'B1', 'D3'])
  })
  it('cover every track once, both ways round', () => {
    expect(new Set(CODES.map((c) => c.code)).size).toBe(TRACKS.length)
    for (const { code, track } of CODES) {
      expect(trackByCode(code)).toBe(track)
      expect(trackByCode(code.toLowerCase())).toBe(track)
      expect(codeOfTrack(track.id)).toBe(code)
    }
    expect(trackByCode('Z9')).toBeNull()
  })
})

describe('queue items', () => {
  it('have keys that tell days and tracks apart', () => {
    const a = itemKey({ kind: 'live', layer: 'sst', date: '2026-11-12' })
    expect(a).not.toBe(itemKey({ kind: 'live', layer: 'sst', date: '2026-11-13' }))
    expect(a).not.toBe(itemKey({ kind: 'live', layer: 'sst', date: '2026-11-12', then: '2025-11-12' }))
    expect(itemKey({ kind: 'track', id: 'co' })).toBe('t:co')
  })
  it('read nicely', () => {
    expect(itemLabel({ kind: 'track', id: 'co' })).toBe('Carbon monoxide')
    expect(itemLabel({ kind: 'live', layer: 'sst', date: '2026-11-12' })).toBe('Sea temperature · 12 Nov')
    expect(itemLabel({ kind: 'live', layer: 'rain', date: '2026-11-12', then: '2025-11-12' })).toBe('Rain and snow · 12 Nov → 12 Nov')
  })
  it('shuffle keeps every item', () => {
    const s = shuffled(ALL_TRACKS)
    expect(s).toHaveLength(ALL_TRACKS.length)
    expect(new Set(s.map(itemKey))).toEqual(new Set(ALL_TRACKS.map(itemKey)))
  })
})

describe('stations', () => {
  const today = new Date('2026-11-15T10:00:00Z')
  const items = (id: string) => STATIONS.find((s) => s.id === id)!.items(today)
  it('ocean radio plays 30 days of sea temperature, oldest first, ending at the newest ready day', () => {
    const days = items('ocean')
    expect(days).toHaveLength(30)
    expect(days[0]).toEqual({ kind: 'live', layer: 'sst', date: '2026-10-15' })
    expect(days.at(-1)).toEqual({ kind: 'live', layer: 'sst', date: '2026-11-13' })
  })
  it('storm watch is the last week of rain', () => {
    const days = items('storm')
    expect(days.map((d) => d.kind === 'live' && d.date)).toEqual([
      '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
    ])
  })
  it('this week on Earth has one day of every live layer', () => {
    expect(items('week').map((d) => d.kind === 'live' && d.layer)).toEqual(['sst', 'rain', 'green', 'landtemp', 'aod'])
  })
})
