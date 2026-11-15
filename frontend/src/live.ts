// Live maps from NASA GIBS (the imagery behind Worldview): any layer, any day.
// Images and colour tables come straight from GIBS, which allows browser requests.
import type { Track } from './tracks'

export interface LiveLayer {
  id: string // short name for links, e.g. "sst"
  title: string
  gibs: string // GIBS layer name
  colormap: string // GIBS colour table name
  about: string
  listen: string
  from: string // instrument or model, for the data panel
  measure: { label: string; unit: string; digits?: number }
  toUnit?: (v: number) => number // colour-table units -> what we show
  start: string // first day with data
  lagDays: number // how far behind today the newest data usually is
  worldview: string // Worldview layer list, for the "see it on NASA Worldview" link
}

export const LIVE_LAYERS: LiveLayer[] = [
  {
    id: 'sst',
    title: 'Sea temperature',
    gibs: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
    from: 'MUR analysis (NASA JPL), blending several satellites',
    colormap: 'GHRSST_Sea_Surface_Temperature',
    about: 'Sea surface temperature from the MUR analysis, blending several satellites.',
    listen: 'Warm tropical seas sit in the middle of the map, so the melody hovers around the middle and swells there.',
    measure: { label: 'sea temperature', unit: '°C' },
    start: '2002-06-01',
    lagDays: 2,
    worldview: 'GHRSST_L4_MUR_Sea_Surface_Temperature,Coastlines_15m',
  },
  {
    id: 'rain',
    title: 'Rain and snow',
    gibs: 'IMERG_Precipitation_Rate',
    from: 'IMERG, from the GPM satellite constellation (NASA and JAXA)',
    colormap: 'GPM_Precipitation_Rate',
    about: 'Rain and snow falling right now, from the GPM satellites (IMERG).',
    listen: 'Storm bands come through as bursts of notes; dry stretches go quiet.',
    measure: { label: 'rain rate', unit: 'mm an hour', digits: 1 },
    start: '2000-06-01',
    lagDays: 2,
    worldview: 'IMERG_Precipitation_Rate,Coastlines_15m',
  },
  {
    id: 'green',
    title: 'Plant greenness',
    gibs: 'MODIS_Terra_NDVI_8Day',
    from: 'MODIS on the Terra satellite, 8-day composite',
    colormap: 'MODIS_NDVI',
    about: 'How green the land is (NDVI), from MODIS on the Terra satellite, over 8 days.',
    listen: 'Rainforests and farmland play the busiest, loudest passages; deserts and ice go quiet.',
    measure: { label: 'greenness (NDVI)', unit: '', digits: 2 },
    start: '2025-02-12',
    lagDays: 3,
    worldview: 'MODIS_Terra_NDVI_8Day,Coastlines_15m',
  },
  {
    id: 'landtemp',
    title: 'Land temperature',
    gibs: 'MODIS_Terra_Land_Surface_Temp_Day',
    from: 'MODIS on the Terra satellite, daytime pass',
    colormap: 'MODIS_Land_Surface_Temp',
    about: 'Daytime ground temperature from MODIS on the Terra satellite.',
    listen: 'Hot deserts and cold ice sheets have different colours, so they get different instruments.',
    measure: { label: 'land temperature', unit: '°C' },
    toUnit: (k) => k - 273.15,
    start: '2000-02-24',
    lagDays: 2,
    worldview: 'MODIS_Terra_Land_Surface_Temp_Day,Coastlines_15m',
  },
  {
    id: 'aod',
    title: 'Haze and smoke',
    gibs: 'MODIS_Combined_Value_Added_AOD',
    from: 'MODIS on the Terra and Aqua satellites, combined',
    colormap: 'MODIS_Combined_Value_Added_AOD',
    about: 'How much dust, smoke and haze is in the air (aerosol optical depth), from MODIS.',
    listen: 'Thick smoke and dust plumes play louder; gaps are places the satellite could not see.',
    measure: { label: 'aerosol optical depth', unit: '', digits: 2 },
    start: '2017-04-19',
    lagDays: 2,
    worldview: 'MODIS_Combined_Value_Added_AOD,Coastlines_15m',
  },
]

export const WORLD = { west: -180, east: 180, north: 90, south: -90 }
const WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'

export function wmsUrl(layer: string, date: string | null, format = 'image/png') {
  const q = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', CRS: 'EPSG:4326',
    BBOX: '-90,-180,90,180', WIDTH: '1024', HEIGHT: '512', FORMAT: format, LAYERS: layer,
  })
  if (date) q.set('TIME', date)
  return `${WMS}?${q}`
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
export const daysAgo = (n: number, from = new Date()) => iso(new Date(from.getTime() - n * 86400_000))
export const yearBefore = (date: string) => `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`
export const validDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))

// "12 November 2026"
export const prettyDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// A live map dressed up as a track, so the rest of the app treats it like any other.
export function liveTrack(layer: LiveLayer, date: string, then?: string): Track {
  const title = then
    ? `${layer.title}, ${prettyDate(then)} → ${prettyDate(date)}`
    : `${layer.title}, ${prettyDate(date)}`
  return {
    id: `live-${layer.id}`,
    title,
    about: layer.about,
    listen: layer.listen,
    mode: 'adaptive',
    crop: 0,
    cropTop: 0,
    geo: WORLD,
    measure: layer.measure,
    source: {
      label: `NASA GIBS / Worldview: ${layer.gibs}`,
      url: `https://worldview.earthdata.nasa.gov/?l=${layer.worldview}&t=${date}`,
    },
    live: { layer: layer.id, date, then },
    data: { from: layer.from, when: then ? `${prettyDate(then)} and ${prettyDate(date)}` : prettyDate(date) },
  }
}

// ---- Real values from the official colour table ----

export interface ColourEntry {
  rgb: number // 0xRRGGBB
  value: number
}

// GIBS colour tables give each colour a range like "[15.90,16.05)". We keep the middle;
// for the open-ended first and last ranges, the end that touches the rest of the scale.
export function parseColormap(xml: string, toUnit: (v: number) => number = (v) => v): ColourEntry[] {
  const out: ColourEntry[] = []
  const entries = [...xml.matchAll(/<ColorMapEntry\s([^>]*?)\/?>/g)].map((m) => m[1])
  const attr = (s: string, k: string) => new RegExp(`\\b${k}="([^"]*)"`).exec(s)?.[1]
  const data = entries.filter((e) => attr(e, 'transparent') !== 'true' && attr(e, 'nodata') !== 'true' && attr(e, 'value'))
  data.forEach((e, i) => {
    const nums = (attr(e, 'value') ?? '')
      .replace(/[[\]()]/g, '')
      .split(',')
      .map((s) => (/INF/i.test(s) ? NaN : Number(s)))
    const [a, b = a] = nums
    let v: number
    if (!isFinite(a) || (i === 0 && isFinite(b) && nums.length > 1)) v = b
    else if (!isFinite(b) || (i === data.length - 1 && nums.length > 1)) v = a
    else v = (a + b) / 2
    const [r, g, bl] = (attr(e, 'rgb') ?? '').split(',').map(Number)
    if (isFinite(v) && [r, g, bl].every((n) => n >= 0 && n <= 255)) out.push({ rgb: (r << 16) | (g << 8) | bl, value: toUnit(v) })
  })
  return out
}

// Median value per slice, by exact colour lookup (PNG keeps the colours exact).
// With `at` (height per slice, 0 = bottom .. 1 = top), only a band around that height
// counts, so the reading matches the place the description names.
// Slices with too few readable pixels get no value, like the engine does.
export function readValues(
  px: Uint8ClampedArray, width: number, height: number, entries: ColourEntry[], columns: number, at?: (number | undefined)[],
) {
  const table = new Map<number, number>()
  for (const e of entries) if (!table.has(e.rgb)) table.set(e.rgb, e.value)
  const out: (number | undefined)[] = []
  for (let c = 0; c < columns; c++) {
    const x0 = Math.floor((c * width) / columns)
    const x1 = Math.floor(((c + 1) * width) / columns)
    const pos = at?.[c]
    const half = Math.round(height * 0.08)
    const mid = pos === undefined ? 0 : Math.round((1 - pos) * (height - 1))
    const y0 = pos === undefined ? 0 : Math.max(0, mid - half)
    const y1 = pos === undefined ? height : Math.min(height, mid + half + 1)
    const vals: number[] = []
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4
        if (px[i + 3] < 128) continue // transparent: no data
        const v = table.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])
        if (v !== undefined) vals.push(v)
      }
    }
    if (vals.length < 0.03 * (x1 - x0) * (y1 - y0)) {
      out.push(undefined)
      continue
    }
    vals.sort((a, b) => a - b)
    out.push(vals[Math.floor(vals.length / 2)])
  }
  return out
}

const colormaps = new Map<string, Promise<string>>()
export const fetchColormap = (name: string) => {
  if (!colormaps.has(name)) {
    const p = fetch(`https://gibs.earthdata.nasa.gov/colormaps/v1.3/${name}.xml`).then((r) => {
      if (!r.ok) throw new Error('colour table')
      return r.text()
    })
    p.catch(() => colormaps.delete(name))
    colormaps.set(name, p)
  }
  return colormaps.get(name)!
}

// Draws the data over a dark sea with coastlines on top, for showing (the engine hears the raw data).
export async function displayImage(data: ImageBitmap, coast: ImageBitmap | null) {
  const canvas = document.createElement('canvas')
  canvas.width = data.width
  canvas.height = data.height
  const g = canvas.getContext('2d')!
  g.fillStyle = '#05070a'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.drawImage(data, 0, 0)
  if (coast) {
    // GIBS coastlines are dark; flip them light so they show on the dark sea.
    g.globalAlpha = 0.55
    g.filter = 'invert(1)'
    g.drawImage(coast, 0, 0, canvas.width, canvas.height)
  }
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.9))
  return URL.createObjectURL(blob!)
}

export function pixelsOf(img: ImageBitmap) {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0)
  return g.getImageData(0, 0, img.width, img.height).data
}
