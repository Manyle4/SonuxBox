import { describe, expect, it } from 'vitest'
import { columnInfo, describeCompare, describePiece, describeSeries, layerName, valueAt } from '../describe'
import { TRACKS } from '../tracks'
import { load } from './load'

const track = (id: string) => TRACKS.find((t) => t.id === id)!

describe('columnInfo', () => {
  it.each(TRACKS.flatMap((t) => (t.frames ?? [{ id: t.id }]).map((f) => f.id)))(
    'finds every melody note of %s at the slice where it starts',
    (id) => {
      const r = load(`${id}.adaptive`)
      for (const n of r.notes.filter((x) => x.voice === 'melody')) {
        expect(columnInfo(r, Math.round(n.start / r.stepSec)).melody).toBe(n)
      }
    },
  )
})

describe('describePiece', () => {
  it('names the strongest region on a world map', () => {
    const text = describePiece(load('co.adaptive'), 'Carbon monoxide', track('co'))
    expect(text).toContain('strongest signal is over Central Africa')
  })
  it('falls back to left/right without map edges', () => {
    expect(describePiece(load('gedi.terrain'), 'Forest height')).toMatch(/at the (far )?(left|middle|right)/)
  })
  it('reads the sea temperature range', () => {
    expect(describePiece(load('current.adaptive'), 'Ocean currents', track('current'))).toMatch(
      /Sea temperature runs from about \d+ °C .* to about \d+ °C/,
    )
  })
})

describe('describeSeries', () => {
  it('says Ukraine got darker', () => {
    const text = describeSeries(
      [{ result: load('ukraine2012.adaptive'), label: '2012' }, { result: load('ukraine2023.adaptive'), label: '2023' }],
      'Ukraine lights',
    )
    expect(text).toMatch(/signal falls by about \d+%/)
  })
})

describe('describeCompare', () => {
  it('puts the first track on the left', () => {
    expect(describeCompare(load('co.adaptive'), load('aerosol.adaptive'), 'CO', 'Aerosols')).toMatch(/^CO plays in your left ear/)
  })
})

describe('legend helpers', () => {
  it('names aerosol layers by the legend', () => {
    const names = (load('aerosol.adaptive').layers ?? []).map((l) => layerName(l, track('aerosol')))
    expect(names).toContain('dust')
  })
  it('gives a value only when the track has a scale', () => {
    expect(valueAt(load('current.adaptive'), 10, track('current'))).toMatch(/^about \d+ °C$/)
    expect(valueAt(load('co.adaptive'), 10, track('co'))).toBeNull()
  })
})
