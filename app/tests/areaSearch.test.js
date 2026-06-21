import { describe, it, expect } from 'vitest'
import { normalizeAreaNumber, filterAreas } from '../src/utils/areaSearch.js'

// Small literal fixture — do not import the real 155-entry data file here.
const FIXTURE_AREAS = [
  { name: '001' },
  { name: '002' },
  { name: '026' },
  { name: 'U07' },
  { name: 'U12' },
  { name: 'JOGLO 10' },
]

const FIXTURE_SET = new Set(FIXTURE_AREAS.map((a) => a.name))

describe('normalizeAreaNumber', () => {
  it('passes through an exact match unchanged', () => {
    expect(normalizeAreaNumber('001', FIXTURE_SET)).toBe('001')
  })

  it('strips surrounding/internal whitespace', () => {
    expect(normalizeAreaNumber('  0 0 1  ', FIXTURE_SET)).toBe('001')
  })

  it('returns empty string for empty/blank input', () => {
    expect(normalizeAreaNumber('', FIXTURE_SET)).toBe('')
    expect(normalizeAreaNumber('   ', FIXTURE_SET)).toBe('')
  })

  it('pads unit codes like u7 -> U07', () => {
    expect(normalizeAreaNumber('u7', FIXTURE_SET)).toBe('U07')
    expect(normalizeAreaNumber('unit 7', FIXTURE_SET)).toBe('U07')
  })

  it('pads numeric codes to 3 digits', () => {
    expect(normalizeAreaNumber('26', FIXTURE_SET)).toBe('026')
  })

  it('falls back to the last number group (unpadded) when the padded form is not in the set', () => {
    const set = new Set(['7']) // only the unpadded form exists
    expect(normalizeAreaNumber('7', set)).toBe('7')
  })

  it('falls back to the raw compacted string when nothing matches', () => {
    expect(normalizeAreaNumber('ZZZ', FIXTURE_SET)).toBe('ZZZ')
  })

  it('handles null/undefined/non-string input without throwing', () => {
    expect(normalizeAreaNumber(null, FIXTURE_SET)).toBe('')
    expect(normalizeAreaNumber(undefined, FIXTURE_SET)).toBe('')
    expect(() => normalizeAreaNumber(123, FIXTURE_SET)).not.toThrow()
  })

  it('handles a missing/undefined areaNameSet without throwing', () => {
    expect(() => normalizeAreaNumber('001', undefined)).not.toThrow()
  })
})

describe('filterAreas', () => {
  it('returns [] for an empty query', () => {
    expect(filterAreas(FIXTURE_AREAS, '')).toEqual([])
    expect(filterAreas(FIXTURE_AREAS, '   ')).toEqual([])
  })

  it('handles null/undefined/non-string query without throwing', () => {
    expect(filterAreas(FIXTURE_AREAS, null)).toEqual([])
    expect(filterAreas(FIXTURE_AREAS, undefined)).toEqual([])
    expect(() => filterAreas(FIXTURE_AREAS, 123)).not.toThrow()
  })

  it('ranks startsWith matches before substring-only matches', () => {
    const areas = [
      { name: 'AJOGLO' }, // contains 'JOGLO' but doesn't start with it
      { name: 'JOGLO 10' }, // starts with 'JOGLO'
    ]
    const result = filterAreas(areas, 'JOGLO')
    expect(result.map((a) => a.name)).toEqual(['JOGLO 10', 'AJOGLO'])
  })

  it('never returns more than the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `A${i}` }))
    const result = filterAreas(many, 'A', 5)
    expect(result.length).toBe(5)
  })

  it('is case-insensitive', () => {
    expect(filterAreas(FIXTURE_AREAS, 'u0')).toEqual([{ name: 'U07' }])
    expect(filterAreas(FIXTURE_AREAS, 'joglo')).toEqual([{ name: 'JOGLO 10' }])
  })

  it('does not mutate the input array', () => {
    const original = [...FIXTURE_AREAS]
    filterAreas(FIXTURE_AREAS, '0')
    expect(FIXTURE_AREAS).toEqual(original)
    expect(FIXTURE_AREAS.length).toBe(original.length)
  })

  it('defaults the limit to 8', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `B${i}` }))
    const result = filterAreas(many, 'B')
    expect(result.length).toBe(8)
  })
})
