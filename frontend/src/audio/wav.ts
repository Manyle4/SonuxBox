// 16-bit stereo WAV from two float channels (-1..1).
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const n = left.length
  const view = new DataView(new ArrayBuffer(44 + n * 4))
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + n * 4, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 2, true) // stereo
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, n * 4, true)
  for (let i = 0; i < n; i++) {
    view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, left[i])) * 32767, true)
    view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, right[i])) * 32767, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}
