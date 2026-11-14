export interface Sample {
  id: string
  label: string
  blurb: string
}

// Files live in public/samples (1024px wide copies of the test maps).
export const SAMPLES: Sample[] = [
  { id: 'co', label: 'Carbon monoxide', blurb: 'Fires and pollution plumes' },
  { id: 'o3', label: 'Ozone', blurb: 'The global ozone layer' },
  { id: 'nox', label: 'Nitrogen oxides', blurb: 'Traffic and industry' },
  { id: 'aerosol', label: 'Aerosols', blurb: 'Dust, smoke and sea salt' },
  { id: 'temperature', label: 'Sea temperature', blurb: 'Warm tropics, cold poles' },
  { id: 'light1', label: 'Night lights', blurb: 'Cities after dark' },
  { id: 'image', label: 'Weather', blurb: 'Storms and rain bands' },
  { id: 'gedi', label: 'Forest height', blurb: 'Africa from orbit' },
]

export const sampleUrl = (id: string) => `/samples/${id}.jpg`
