import type { AnalysisMode } from './api'

export interface Track {
  id: string
  title: string
  about: string // what the data shows
  listen: string // what to listen for
  mode: AnalysisMode // the mode that suits this image best
  source: { label: string; url: string }
}

// Frames from NASA's Earth Information Center visuals, made by the Scientific
// Visualization Studio (SVS). Files are 1024px copies in public/samples.
const AIR_QUALITY = { label: 'NASA GMAO / SVS: Air Quality Model Runs', url: 'https://svs.gsfc.nasa.gov/5533/' }

export const TRACKS: Track[] = [
  {
    id: 'co',
    title: 'Carbon monoxide',
    about: 'Carbon monoxide from fires and pollution, tracked by the GEOS-CF model.',
    listen: 'Where the plumes are thickest, the melody gets louder and the chords fill out.',
    mode: 'adaptive',
    source: AIR_QUALITY,
  },
  {
    id: 'o3',
    title: 'Ozone',
    about: 'Ozone near the surface, from the same GEOS-CF air quality model.',
    listen: 'Patches of high ozone bring the melody in; cleaner air brings rests.',
    mode: 'adaptive',
    source: AIR_QUALITY,
  },
  {
    id: 'nox',
    title: 'Nitrogen oxides',
    about: 'Nitrogen oxides from traffic, industry and shipping lanes.',
    listen: 'Cities and shipping lanes stand out against clean air as runs of notes.',
    mode: 'adaptive',
    source: AIR_QUALITY,
  },
  {
    id: 'aerosol',
    title: 'Aerosols',
    about: 'Dust, smoke, sea salt and other particles drifting through the atmosphere (GEOS).',
    listen: 'Thick dust and smoke make the music louder and busier.',
    mode: 'adaptive',
    source: { label: 'NASA SVS: GEOS Aerosols', url: 'https://svs.gsfc.nasa.gov/5669/' },
  },
  {
    id: 'temperature',
    title: 'Sea temperature',
    about: 'Sea surface temperature: warm tropics, cold poles.',
    listen: 'The melody follows where the strongest colours sit, from pole to pole.',
    mode: 'adaptive',
    source: { label: 'NASA SVS: Global Sea Surface Currents and Temperature', url: 'https://svs.gsfc.nasa.gov/3912/' },
  },
  {
    id: 'light1',
    title: 'Night lights',
    about: "Earth's cities after dark, seen from space.",
    listen: 'Dark oceans fall quiet; bright clusters of cities bring bursts of notes.',
    mode: 'adaptive',
    source: { label: 'NASA SVS: Change in Night Lights 2012–2023', url: 'https://svs.gsfc.nasa.gov/5313/' },
  },
  {
    id: 'gedi',
    title: 'Forest height',
    about: 'Forest canopy height over Africa, measured by the GEDI laser on the ISS.',
    listen: 'Terrain mode follows the land: land higher up the image plays higher notes.',
    mode: 'terrain',
    source: { label: 'NASA SVS: GEDI Forest Height', url: 'https://svs.gsfc.nasa.gov/4950/' },
  },
]

export const trackUrl = (id: string) => `/samples/${id}.jpg`
