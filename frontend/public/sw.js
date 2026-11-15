// Keeps SonuxBox working offline: the app and the whole jukebox (images, results,
// narration) are cached on first visit. Uploads still need the internet.
const VERSION = '__VERSION__' // stamped at build time, so a new deploy refreshes the cache
const CACHE = `sonux-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const list = await (await fetch('/offline.json', { cache: 'no-store' })).json()
      await cache.addAll(['/', ...list.files])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return // the API isn't cached

  // Pages: try the network, fall back to the cached app.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }
  // Everything else: cache first, and keep a copy of anything new.
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true })
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
      return res
    })(),
  )
})
