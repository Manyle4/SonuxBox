// Runs every jukebox track through the engine in both modes and saves the results
// to public/tracks, so the site can play them without calling the API.
//   npm run prerender            (uses VITE_API_URL or the Heroku app)
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const API = (process.env.VITE_API_URL ?? 'https://sonuxbox-api-285f8ea04b1d.herokuapp.com').replace(/\/$/, '')
const tracks = JSON.parse(await readFile(new URL('../src/tracks.json', import.meta.url)))
const out = new URL('../public/tracks/', import.meta.url)
await mkdir(out, { recursive: true })

for (const t of tracks) {
  for (const mode of ['adaptive', 'terrain']) {
    const form = new FormData()
    const bytes = await readFile(new URL(`../public/samples/${t.id}.jpg`, import.meta.url))
    form.append('image', new Blob([bytes], { type: 'image/jpeg' }), `${t.id}.jpg`)
    form.append('mode', mode)
    if (t.crop !== undefined) form.append('crop', String(t.crop))

    const res = await fetch(`${API}/api/analyze`, { method: 'POST', body: form })
    const body = await res.json()
    if (!res.ok) throw new Error(`${t.id} (${mode}): ${body.error ?? res.status}`)
    delete body.audioUrl // that file lives on the server for a while only; the page makes its own audio
    await writeFile(new URL(`${t.id}.${mode}.json`, out), JSON.stringify(body))
    console.log(`${t.id}.${mode}: ${body.scale}, ${body.notes.length} notes`)
  }
}
