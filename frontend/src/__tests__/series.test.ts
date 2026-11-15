import { describe, expect, it } from 'vitest'
import { joinFrames, segmentAt } from '../series'
import { load } from './load'

describe('joinFrames', () => {
  const a = load('ukraine2012.adaptive')
  const b = load('ukraine2023.adaptive')
  const j = joinFrames([
    { result: a, label: '2012', imageUrl: 'a' },
    { result: b, label: '2023', imageUrl: 'b' },
  ])

  it('plays the second frame after the first, with a gap', () => {
    expect(j.segments[1].start).toBeGreaterThan(j.segments[0].end)
    expect(j.piece.notes.length).toBe(a.notes.length + b.notes.length)
  })
  it('pans each note by its place in its own image', () => {
    for (const n of j.piece.notes) expect(n.pos).toBeGreaterThanOrEqual(0)
  })
  it('finds the frame playing at a time', () => {
    expect(segmentAt(j.segments, 0)).toBe(0)
    expect(segmentAt(j.segments, j.segments[1].start + 0.1)).toBe(1)
  })
})
