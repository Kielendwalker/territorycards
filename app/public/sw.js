const TILE_CACHE = 'osm-tiles-v1'
const TILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 1 month

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function isTileRequest(url) {
  return url.hostname.endsWith('tile.openstreetmap.org') && /\/\d+\/\d+\/\d+\.png$/.test(url.pathname)
}

// Tiles load via <img> tags, so the browser fetches them cross-origin in
// 'no-cors' mode. The resulting Response is opaque: reading its body with
// .blob()/.text() (even inside the SW) yields an empty result, so it must be
// cached via cache.put() untouched — and since its headers are inaccessible
// too, freshness is tracked separately via this small sidecar entry.
function metaRequest(url) {
  return new Request(url.replace(/\.png$/, '.meta'))
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !isTileRequest(url)) return

  event.respondWith(
    caches.open(TILE_CACHE).then(async (cache) => {
      const [cachedTile, cachedMeta] = await Promise.all([
        cache.match(event.request),
        cache.match(metaRequest(event.request.url)),
      ])

      if (cachedTile && cachedMeta) {
        const cachedAt = Number(await cachedMeta.text())
        if (Date.now() - cachedAt < TILE_MAX_AGE_MS) {
          return cachedTile
        }
      }

      try {
        const response = await fetch(event.request)
        await cache.put(event.request, response.clone())
        await cache.put(metaRequest(event.request.url), new Response(String(Date.now())))
        return response
      } catch (err) {
        if (cachedTile) return cachedTile
        throw err
      }
    })
  )
})
