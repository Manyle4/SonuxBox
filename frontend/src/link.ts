// Keep the address bar in step with the open track, so it can be shared.
export function setLink(track: string | null, mode: string | null, compare: string | null = null) {
  const q = new URLSearchParams()
  if (track) q.set('track', track)
  if (track && mode) q.set('mode', mode)
  if (track && compare) q.set('compare', compare)
  write(q)
}

// A live NASA map: ?live=sst&date=2026-11-12(&then=2025-11-12)
export function setLiveLink(layer: string, date: string, then?: string) {
  const q = new URLSearchParams({ live: layer, date })
  if (then) q.set('then', then)
  write(q)
}

function write(q: URLSearchParams) {
  const search = q.toString()
  history.replaceState(null, '', search ? `?${search}` : location.pathname)
}
