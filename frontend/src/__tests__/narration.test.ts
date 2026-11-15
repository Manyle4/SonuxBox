import { describe, expect, it } from 'vitest'
import { allNarrations, speakable, textHash } from '../narration'
import { TRACKS } from '../tracks'
import { load } from './load'

describe('speakable', () => {
  it('spells out symbols a voice would trip on', () => {
    expect(speakable('C# mixolydian → 2023, about 11 s')).toBe('C sharp mixolydian to 2023, about 11 seconds')
  })
})

describe('textHash', () => {
  it('matches the Python recorder (tools/narration/speak.py)', () => {
    expect(textHash('C sharp mixolydian to 2023 °C')).toBe('67fe7eeb')
  })
})

describe('allNarrations', () => {
  it('has every track in both modes, plus the tour', () => {
    const all = allNarrations((id, mode) => load(`${id}.${mode}`), TRACKS)
    for (const t of TRACKS) {
      expect(all[`${t.id}.adaptive`]).toBeTruthy()
      expect(all[`${t.id}.terrain`]).toBeTruthy()
    }
    expect(all['tour.0']).toMatch(/^Welcome to SonuxBox/)
    expect(Object.values(all).join(' ')).not.toMatch(/[#♯→]/)
  })
})
