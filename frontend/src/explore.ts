import type { ColumnInfo } from './describe'

// Tiny Web Audio synth for explore mode: plays one column's notes as a short pluck.
let ctx: AudioContext | null = null

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

function pluck(ac: AudioContext, hz: number, gain: number, at: number, len: number, type: OscillatorType) {
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.value = hz
  amp.gain.setValueAtTime(0, at)
  amp.gain.linearRampToValueAtTime(gain, at + 0.01)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + len)
  osc.connect(amp).connect(ac.destination)
  osc.start(at)
  osc.stop(at + len + 0.05)
}

export function playColumn(info: ColumnInfo) {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const now = ctx.currentTime

  if (info.rest || !info.melody) {
    pluck(ctx, 110, 0.05, now, 0.12, 'sine') // soft thud: nothing much here
    return
  }
  const loud = 0.08 + 0.17 * info.strength
  pluck(ctx, freq(info.melody.midi), loud, now, 0.45, 'triangle')
  if (info.bass) pluck(ctx, freq(info.bass.midi), loud * 0.6, now, 0.5, 'sine')
}
