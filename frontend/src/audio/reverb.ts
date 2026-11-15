// A simple room: decaying stereo noise as the impulse response. Seeded, so every
// render sounds the same, and made in code so there's no file to download.
export const REVERB_WET = 0.22 // how much room to mix in
const SECONDS = 2.4
const DECAY = 3.2

export function makeImpulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(SECONDS * ctx.sampleRate)
  const ir = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    let seed = 9001 + ch * 7919
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const noise = (seed >>> 8) / 8388608 - 1
      data[i] = noise * (1 - i / length) ** DECAY
    }
  }
  return ir
}

// dry + wet paths into `out`. Returns the node to feed and the wet gain (for on/off).
export function addReverb(ctx: BaseAudioContext, out: AudioNode, on: boolean) {
  const input = ctx.createGain()
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  const room = ctx.createConvolver()
  room.buffer = makeImpulse(ctx)
  wet.gain.value = on ? REVERB_WET : 0
  input.connect(dry).connect(out)
  input.connect(room).connect(wet).connect(out)
  return { input, wet }
}
