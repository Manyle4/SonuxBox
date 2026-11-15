import { describe, expect, it } from 'vitest'
import { daysAgo, LIVE_LAYERS, liveTrack, parseColormap, readValues, validDate, wmsUrl, yearBefore } from '../live'
import { formatValue } from '../describe'

// Trimmed copy of a GIBS colour table: a no-data entry, open-ended ends, ranges and a single value.
const XML = `<ColorMaps>
  <ColorMap title="No Data"><Entries>
    <ColorMapEntry rgb="0,0,0" transparent="true" nodata="true" ref="0"/>
  </Entries></ColorMap>
  <ColorMap title="SST" units="°C"><Entries>
    <ColorMapEntry rgb="43,0,26" transparent="false" sourceValue="[-INF,0.00)" value="[-INF,0.00)" ref="1"/>
    <ColorMapEntry rgb="10,20,30" transparent="false" value="[10.00,12.00)" ref="2"/>
    <ColorMapEntry rgb="200,100,0" transparent="false" value="[5]" ref="3"/>
    <ColorMapEntry rgb="107,2,0" transparent="false" value="[32.00,+INF)" ref="4"/>
  </Entries></ColorMap>
</ColorMaps>`

describe('parseColormap', () => {
  it('skips no-data and keeps the useful value of each range', () => {
    const e = parseColormap(XML)
    expect(e.map((x) => x.value)).toEqual([0, 11, 5, 32])
    expect(e[1].rgb).toBe((10 << 16) | (20 << 8) | 30)
  })
  it('converts units', () => {
    expect(parseColormap(XML, (k) => k - 273.15)[1].value).toBeCloseTo(11 - 273.15)
  })
})

// A 4x40 image, two slices: left half all 11 °C, right half one hot pixel (under 3%).
function image() {
  const w = 4, h = 40
  const px = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const left = x < 2
      const hot = !left && y === 0 // one hot pixel at the top right
      if (left) px.set([10, 20, 30, 255], i)
      else if (hot) px.set([107, 2, 0, 255], i)
      else px.set([0, 0, 0, 0], i) // transparent
    }
  }
  return { px, w, h }
}

describe('readValues', () => {
  const table = parseColormap(XML)
  it('reads the median by exact colour, and leaves thin slices empty', () => {
    const { px, w, h } = image()
    expect(readValues(px, w, h, table, 2)).toEqual([11, undefined])
  })
  it('reads only a band around the given height', () => {
    const { px, w, h } = image()
    // Right slice, near the top: the one hot pixel is now a fair share of the band.
    expect(readValues(px, w, h, table, 2, [0.5, 1])[1]).toBe(32)
  })
})

describe('live helpers', () => {
  it('builds a WMS request for the day', () => {
    const u = new URL(wmsUrl('GHRSST_L4_MUR_Sea_Surface_Temperature', '2026-11-12'))
    expect(u.searchParams.get('LAYERS')).toBe('GHRSST_L4_MUR_Sea_Surface_Temperature')
    expect(u.searchParams.get('TIME')).toBe('2026-11-12')
    expect(u.searchParams.get('FORMAT')).toBe('image/png')
  })
  it('handles dates', () => {
    expect(yearBefore('2026-11-12')).toBe('2025-11-12')
    expect(daysAgo(2, new Date('2026-11-15T10:00:00Z'))).toBe('2026-11-13')
    expect(validDate('2026-11-12')).toBe(true)
    expect(validDate('12/11/2026')).toBe(false)
    expect(validDate(null)).toBe(false)
  })
  it('turns a layer into a track the player understands', () => {
    const t = liveTrack(LIVE_LAYERS[0], '2026-11-12', '2025-11-12')
    expect(t.title).toBe('Sea temperature, 12 November 2025 → 12 November 2026')
    expect(t.crop).toBe(0)
    expect(t.geo).toEqual({ west: -180, east: 180, north: 90, south: -90 })
    expect(t.live).toEqual({ layer: 'sst', date: '2026-11-12', then: '2025-11-12' })
    expect(t.source.url).toContain('t=2026-11-12')
  })
  it('every layer has a unique id and a start date', () => {
    expect(new Set(LIVE_LAYERS.map((l) => l.id)).size).toBe(LIVE_LAYERS.length)
    for (const l of LIVE_LAYERS) expect(validDate(l.start)).toBe(true)
  })
})

describe('formatValue', () => {
  it('rounds to the layer’s digits and drops empty units', () => {
    expect(formatValue(24.4, { label: 'sea temperature', unit: '°C' })).toBe('24 °C')
    expect(formatValue(0.356, { label: 'NDVI', unit: '', digits: 2 })).toBe('0.36')
    expect(formatValue(1.25, { label: 'rain', unit: 'mm an hour', digits: 1 })).toBe('1.3 mm an hour')
  })
})
