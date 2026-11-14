// Keep the address bar in step with the open track, so it can be shared.
export function setLink(track: string | null, mode: string | null) {
  const q = new URLSearchParams()
  if (track) q.set('track', track)
  if (track && mode) q.set('mode', mode)
  const search = q.toString()
  history.replaceState(null, '', search ? `?${search}` : location.pathname)
}
