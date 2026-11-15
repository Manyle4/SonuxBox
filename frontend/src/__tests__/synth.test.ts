import { describe, expect, it } from 'vitest'
import { renderStems, VOICES } from '../audio/synth'
import { load } from './load'

describe('renderStems', () => {
  const r = load('lightning.terrain')
  const a = renderStems(r.notes, 8000, 0)

  it('is deterministic', () => {
    const b = renderStems(r.notes, 8000, 0)
    for (const v of VOICES) expect(b.stems[v].left).toEqual(a.stems[v].left)
  })
  it('makes sound in every layer that has notes', () => {
    for (const v of VOICES) {
      const has = r.notes.some((n) => n.voice === v)
      const loud = a.stems[v].left.some((s) => Math.abs(s) > 1e-4)
      expect(loud).toBe(has)
    }
  })
  it('gives every drum hit the same sound', () => {
    const hits = r.notes.filter((n) => n.voice === 'perc')
    if (hits.length < 2) return
    const at = (n: (typeof hits)[number]) => Math.floor(n.start * 8000)
    const L = a.stems.perc.left
    // compare the first few samples of two hits that don't overlap anything else
    expect(L[at(hits[0]) + 5] / hits[0].vel).toBeCloseTo(L[at(hits[1]) + 5] / hits[1].vel, 3)
  })
})
