// Place names for flat world maps: a slice's longitude plus the height of its signal
// (latitude) pick a region. Coarse on purpose; it's for listening, not navigation.

export interface Geo {
  west: number // longitude at the image's left edge
  east: number
  north: number // latitude at the image's top edge
  south: number
}

type Box = [name: string, latMin: number, latMax: number, lonMin: number, lonMax: number]

// First match wins, so smaller and land regions come before the oceans.
const REGIONS: Box[] = [
  ['Antarctica', -90, -62, -180, 180],
  ['the Arctic', 75, 90, -180, 180],
  ['Greenland', 60, 84, -73, -12],
  ['Alaska and northern Canada', 55, 75, -170, -60],
  ['North America', 25, 55, -130, -60],
  ['Central America and the Caribbean', 7, 25, -118, -60],
  ['South America', -56, 12, -82, -34],
  ['Europe', 36, 71, -10, 40],
  ['the Sahara', 15, 36, -17, 33],
  ['the Middle East', 12, 42, 33, 63],
  ['West Africa', 4, 15, -17, 15],
  ['Central Africa', -12, 15, 8, 42],
  ['southern Africa', -35, -12, 10, 42],
  ['Russia and northern Asia', 50, 75, 40, 180],
  ['Central Asia', 35, 50, 50, 92],
  ['South Asia', 5, 35, 63, 92],
  ['East Asia', 20, 50, 92, 145],
  ['Southeast Asia', -10, 20, 92, 140],
  ['Australia', -44, -10, 112, 154],
  ['the Southern Ocean', -90, -55, -180, 180],
  ['the North Atlantic', 0, 66, -80, -6],
  ['the South Atlantic', -55, 0, -70, 20],
  ['the Indian Ocean', -55, 25, 20, 120],
  ['the North Pacific', 0, 66, 100, 180],
  ['the North Pacific', 0, 66, -180, -80],
  ['the South Pacific', -55, 0, 120, 180],
  ['the South Pacific', -55, 0, -180, -70],
]

export function regionAt(lat: number, lon: number) {
  const hit = REGIONS.find(([, a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d)
  return hit ? hit[0] : 'the open ocean'
}

// Where slice `col` is, with the signal's height (pos: 0 bottom .. 1 top of the
// analysed area, which is the image minus the cropped top and bottom strips).
export function placeOf(geo: Geo, col: number, columns: number, pos: number, cropBottom: number, cropTop = 0) {
  const lon = geo.west + ((col + 0.5) / columns) * (geo.east - geo.west)
  const y = cropTop + (1 - pos) * (1 - cropTop - cropBottom) // 0 = top of the image
  const lat = geo.north - y * (geo.north - geo.south)
  return regionAt(lat, lon)
}
