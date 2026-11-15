import { describe, expect, it } from 'vitest'
import { placeOf, regionAt } from '../geo'

describe('regionAt', () => {
  it.each([
    [0, 20, 'Central Africa'],
    [25, 10, 'the Sahara'],
    [20, 78, 'South Asia'],
    [40, -100, 'North America'],
    [-10, -60, 'South America'],
    [0, -150, 'the North Pacific'],
    [-30, 75, 'the Indian Ocean'],
    [-80, 0, 'Antarctica'],
  ])('lat %d, lon %d is %s', (lat, lon, name) => {
    expect(regionAt(lat, lon)).toBe(name)
  })
})

describe('placeOf', () => {
  const world = { west: -180, east: 180, north: 90, south: -90 }
  it('maps a slice and height to a region', () => {
    // slice 18 of 32 centres on lon 25.3; mid-height is the equator
    expect(placeOf(world, 18, 32, 0.5, 0, 0)).toBe('Central Africa')
    // slice 16 is lon 5.6: the equator there is open sea (Gulf of Guinea)
    expect(placeOf(world, 16, 32, 0.5, 0, 0)).toBe('the South Atlantic')
  })
  it('accounts for cropped strips', () => {
    // with the bottom 50% cropped, the bottom of the analysed area is the equator
    expect(placeOf(world, 18, 32, 0, 0.5, 0)).toBe('Central Africa')
  })
})
