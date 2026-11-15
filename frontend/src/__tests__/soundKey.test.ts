import { describe, expect, it } from 'vitest'
import { keyPhrase, phraseKey, soundKey } from '../soundKey'
import { TRACKS } from '../tracks'
import { load } from './load'

const track = (id: string) => TRACKS.find((t) => t.id === id)!

describe('soundKey', () => {
  it('samples the lowest and highest melody notes of the piece', () => {
    const r = load('co.adaptive')
    const items = soundKey(r, track('co'))
    const melody = r.notes.filter((n) => n.voice === 'melody').map((n) => n.midi)
    expect(items.find((i) => i.id === 'low')!.notes[0].midi).toBe(Math.min(...melody))
    expect(items.find((i) => i.id === 'high')!.notes[0].midi).toBe(Math.max(...melody))
  })
  it('keeps soft quieter than loud, at the same pitch', () => {
    const items = soundKey(load('co.adaptive'), track('co'))
    const soft = items.find((i) => i.id === 'soft')!.notes[0]
    const loud = items.find((i) => i.id === 'loud')!.notes[0]
    expect(soft.vel).toBeLessThan(loud.vel)
    expect(soft.midi).toBe(loud.midi)
  })
  it('says north and south on world maps, top and bottom otherwise', () => {
    expect(keyPhrase(soundKey(load('co.adaptive'), track('co'))[0])).toBe('Low note: the signal sits towards the south.')
    expect(keyPhrase(soundKey(load('gedi.adaptive'))[0])).toBe('Low note: the signal sits low in the image.')
  })
  it('names colour layers from the legend', () => {
    const items = soundKey(load('aerosol.adaptive'), track('aerosol'))
    expect(items.map(keyPhrase)).toContain('Bell: dust areas.')
  })
  it('only adds a drum entry when there are drum hits', () => {
    for (const t of TRACKS.filter((x) => !x.frames)) {
      const r = load(`${t.id}.${t.mode}`)
      const hasHit = r.notes.some((n) => n.voice === 'perc')
      expect(soundKey(r, t).some((i) => i.id === 'perc')).toBe(hasHit)
    }
  })
  it('samples start at zero, centred', () => {
    for (const it of soundKey(load('lightning.adaptive'), track('lightning')))
      for (const n of it.notes) expect([n.start, n.pan]).toEqual([0, 0])
  })
  it('names recordings by their words', () => {
    expect(phraseKey('Soft: weak signal.')).toBe(phraseKey('Soft: weak signal.'))
    expect(phraseKey('Soft: weak signal.')).not.toBe(phraseKey('Loud: strong signal.'))
  })
})
