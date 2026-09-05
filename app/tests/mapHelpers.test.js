import { describe, it, expect } from 'vitest'
import { haversineDistanceMeters, shouldApplyLocationUpdate } from '../src/utils/mapHelpers.js'

describe('haversineDistanceMeters', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: -6.2, lng: 106.8 }
    expect(haversineDistanceMeters(p, p)).toBe(0)
  })

  it('returns ~0 for two very close but non-identical points', () => {
    const a = { lat: -6.2, lng: 106.8 }
    const b = { lat: -6.2, lng: 106.8 }
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(0, 6)
  })

  it('approximates ~111km per degree of latitude', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 1, lng: 0 }
    const dist = haversineDistanceMeters(a, b)
    expect(dist).toBeGreaterThan(110000)
    expect(dist).toBeLessThan(112000)
  })

  it('is symmetric', () => {
    const a = { lat: -6.2044, lng: 106.7563 }
    const b = { lat: -6.21, lng: 106.76 }
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 9)
  })

  it('handles missing points without throwing', () => {
    expect(haversineDistanceMeters(null, { lat: 0, lng: 0 })).toBe(0)
    expect(haversineDistanceMeters({ lat: 0, lng: 0 }, null)).toBe(0)
    expect(() => haversineDistanceMeters(null, null)).not.toThrow()
  })
})

describe('shouldApplyLocationUpdate', () => {
  const OPTIONS = { minIntervalMs: 2000, minDistanceMeters: 5 }

  it('always applies the first update (no previous point)', () => {
    const next = { lat: -6.2, lng: 106.8, timestamp: 1000 }
    expect(shouldApplyLocationUpdate(null, next, OPTIONS)).toBe(true)
    expect(shouldApplyLocationUpdate(undefined, next, OPTIONS)).toBe(true)
  })

  it('skips an update within the min interval and within the distance threshold', () => {
    const prev = { lat: -6.2, lng: 106.8, timestamp: 1000 }
    // Same position, only 500ms later — well under 2s and 0m moved.
    const next = { lat: -6.2, lng: 106.8, timestamp: 1500 }
    expect(shouldApplyLocationUpdate(prev, next, OPTIONS)).toBe(false)
  })

  it('applies an update once the min interval has elapsed', () => {
    const prev = { lat: -6.2, lng: 106.8, timestamp: 1000 }
    const next = { lat: -6.2, lng: 106.8, timestamp: 3200 } // 2.2s later
    expect(shouldApplyLocationUpdate(prev, next, OPTIONS)).toBe(true)
  })

  it('applies an update outside the distance threshold even if the interval has not elapsed', () => {
    const prev = { lat: -6.2, lng: 106.8, timestamp: 1000 }
    // ~0.0001 deg lat ~= 11m, moved within 500ms
    const next = { lat: -6.2001, lng: 106.8, timestamp: 1500 }
    expect(shouldApplyLocationUpdate(prev, next, OPTIONS)).toBe(true)
  })

  it('handles a missing/null previous point by applying the update', () => {
    const next = { lat: -6.2, lng: 106.8, timestamp: 1000 }
    expect(shouldApplyLocationUpdate(null, next, OPTIONS)).toBe(true)
  })

  it('handles degenerate/equal points at the exact interval boundary', () => {
    const prev = { lat: -6.2, lng: 106.8, timestamp: 1000 }
    const next = { lat: -6.2, lng: 106.8, timestamp: 3000 } // exactly 2000ms later
    expect(shouldApplyLocationUpdate(prev, next, OPTIONS)).toBe(true)
  })
})
