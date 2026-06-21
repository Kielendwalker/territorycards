// Pure, unit-testable helpers extracted from App.vue for area search/autocomplete.
// No Vue or Leaflet dependencies so these can be tested in plain Node.

/**
 * Normalize a raw user-entered value into a canonical area-name key.
 *
 * @param {*} value - raw input value (expected string, but handled defensively).
 * @param {{ has: (key: string) => boolean }} areaNameSet - set/map of valid
 *   uppercased area-name keys (anything exposing `.has()`, e.g. a Set or Map).
 * @returns {string} normalized key, or '' if value is empty/blank.
 */
export function normalizeAreaNumber(value, areaNameSet) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return ''

  const compact = raw.replace(/\s+/g, '')
  if (areaNameSet && areaNameSet.has(compact)) return compact

  const unitMatch = compact.match(/U\D*0*(\d+)$/)
  if (unitMatch) {
    const normalizedUnit = 'U' + unitMatch[1].padStart(2, '0')
    if (areaNameSet && areaNameSet.has(normalizedUnit)) return normalizedUnit
  }

  const numbers = compact.match(/\d+/g)
  if (numbers) {
    const last = numbers[numbers.length - 1]
    const padded = String(Number(last)).padStart(3, '0')
    if (areaNameSet && areaNameSet.has(padded)) return padded
    if (areaNameSet && areaNameSet.has(last)) return last
  }

  return compact
}

/**
 * Filter an area list for autocomplete suggestions, capped to `limit` results.
 * Areas whose name starts with the query rank before areas that merely
 * contain the query as a substring. Does not mutate the input array.
 *
 * @param {Array<{ name: string }>} areas
 * @param {*} query - raw query value (expected string, handled defensively).
 * @param {number} [limit=8]
 * @returns {Array<{ name: string }>}
 */
export function filterAreas(areas, query, limit = 8) {
  const list = Array.isArray(areas) ? areas : []
  const q = String(query || '').trim().toUpperCase()
  if (!q) return []

  const startsWith = []
  const includes = []

  for (const area of list) {
    const name = String(area?.name || '').toUpperCase()
    if (!name) continue
    if (name.startsWith(q)) {
      startsWith.push(area)
    } else if (name.includes(q)) {
      includes.push(area)
    }
  }

  return [...startsWith, ...includes].slice(0, limit)
}
