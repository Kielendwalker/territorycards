// Map helper utilities for territory map app

/**
 * Normalize an area number/name input to the canonical key used in areaByName map.
 * @param {string} value - raw input
 * @param {Map} areaByName - map of canonical area names
 * @returns {string} normalized key
 */
export function normalizeAreaNumber(value, areaByName) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return ''

  const compact = raw.replace(/\s+/g, '')
  if (areaByName.has(compact)) return compact

  const unitMatch = compact.match(/U\D*0*(\d+)$/)
  if (unitMatch) {
    const normalizedUnit = 'U' + unitMatch[1].padStart(2, '0')
    if (areaByName.has(normalizedUnit)) return normalizedUnit
  }

  const numbers = compact.match(/\d+/g)
  if (numbers) {
    const last = numbers[numbers.length - 1]
    const padded = String(Number(last)).padStart(3, '0')
    if (areaByName.has(padded)) return padded
    if (areaByName.has(last)) return last
  }

  return compact
}

/**
 * Convert area coords [lng, lat] pairs to Leaflet [lat, lng] format.
 */
export function toLatLngs(area) {
  return area.coords.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
}

/**
 * Get Leaflet polygon style for an area.
 */
export function styleForArea(area, selected = false, dimmed = false) {
  if (selected) {
    return {
      color: '#d96c00',
      fillColor: '#ffcf5a',
      fillOpacity: 0.58,
      opacity: 1,
      weight: 5,
    }
  }
  return {
    color: area.stroke || area.color,
    fillColor: area.color,
    fillOpacity: dimmed ? 0.09 : Math.max(area.fillOpacity, 0.2),
    opacity: dimmed ? 0.45 : 0.92,
    weight: dimmed ? 1 : 1.5,
  }
}

/**
 * Show or hide a Leaflet layer on the given map.
 */
export function setLayerVisible(layer, map, visible) {
  const isVisible = map.hasLayer(layer)
  if (visible && !isVisible) {
    layer.addTo(map)
  } else if (!visible && isVisible) {
    layer.remove()
  }
}

/**
 * Great-circle distance between two {lat, lng} points, in meters.
 */
export function haversineDistanceMeters(a, b) {
  if (!a || !b) return 0
  const R = 6371000 // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return R * c
}

/**
 * Decide whether a new geolocation fix should be applied to the map UI,
 * to throttle noisy/frequent watchPosition updates.
 * @param {{lat:number,lng:number,timestamp:number}|null} prev - last applied point (null if none yet)
 * @param {{lat:number,lng:number,timestamp:number}} next - candidate new point
 * @param {{minIntervalMs:number,minDistanceMeters:number}} options
 * @returns {boolean} true if the update should be applied
 */
export function shouldApplyLocationUpdate(prev, next, { minIntervalMs, minDistanceMeters } = {}) {
  if (!prev || !next) return true

  const elapsed = next.timestamp - prev.timestamp
  if (elapsed >= minIntervalMs) return true

  const distance = haversineDistanceMeters(prev, next)
  if (distance >= minDistanceMeters) return true

  return false
}
