// Renders in the background so the page stays smooth.
import type { Note } from '../api'
import { renderStems, VOICES } from './synth'

export interface RenderRequest {
  id: number
  notes: Note[]
  sampleRate: number
  gridSec: number
}

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  const { id, notes, sampleRate, gridSec } = e.data
  const out = renderStems(notes, sampleRate, gridSec)
  const buffers = VOICES.flatMap((v) => [out.stems[v].left.buffer, out.stems[v].right.buffer])
  ;(self as unknown as Worker).postMessage({ id, ...out }, buffers) // hand the arrays over, no copying
}
