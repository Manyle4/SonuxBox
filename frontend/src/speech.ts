import { speakable, textHash } from './narration'

// Says some text: the recorded Kokoro voice when there's a recording of exactly this
// text, otherwise the browser's voice. Resolves when it's finished (or stopped).
type Index = Record<string, string>
let indexPromise: Promise<Index> | null = null
const narrationIndex = (): Promise<Index> =>
  (indexPromise ??= fetch('/narration/index.json')
    .then((r): Promise<Index> | Index => (r.ok ? r.json() : {}))
    .catch((): Index => ({})))

export interface Speech {
  done: Promise<void>
  stop: () => void
}

export function speak(text: string, recording?: string): Speech {
  let stopFn = () => {}
  const done = (async () => {
    const words = speakable(text)
    const index = await narrationIndex()
    await new Promise<void>((resolve) => {
      if (recording && index[recording] === textHash(words)) {
        const audio = new Audio(`/narration/${recording}.mp3`)
        audio.onended = audio.onerror = () => resolve()
        stopFn = () => { audio.pause(); resolve() }
        void audio.play().catch(() => resolve())
        return
      }
      if (!('speechSynthesis' in window)) return resolve()
      const u = new SpeechSynthesisUtterance(words)
      u.onend = u.onerror = () => resolve()
      stopFn = () => { speechSynthesis.cancel(); resolve() }
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
    })
  })()
  return { done, stop: () => stopFn() }
}
