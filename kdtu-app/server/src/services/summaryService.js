// summaryService — pure CRUD + aggregation for the KDTU summary view.
//
// Source of truth: `kdtu_summary_entries` table (sub-agent F owns schema):
//   id           INTEGER PK
//   period_id    INTEGER FK -> timetable_periods.id
//   bulan        TEXT  -- 'YYYY-MM'
//   location     TEXT
//   sesi         TEXT  -- free-form session description (date, time, who)
//   category     TEXT  CHECK in PUBLICATION_CATEGORY values
//   title        TEXT
//   quantity     INTEGER >= 0
//
// The service throws domain errors (NotFoundError, ValidationError). The
// router translates them to HTTP responses.

import { PUBLICATION_CATEGORY } from '@kdtu/shared'

export class NotFoundError extends Error {
  constructor (message) {
    super(message)
    this.name = 'NotFoundError'
    this.code = 'NOT_FOUND'
  }
}

export class ValidationError extends Error {
  constructor (message, fields = {}) {
    super(message)
    this.name = 'ValidationError'
    this.code = 'VALIDATION'
    this.fields = fields
  }
}

const VALID_CATEGORIES = new Set(Object.values(PUBLICATION_CATEGORY))

const BULAN_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function isBulan (s) {
  return typeof s === 'string' && BULAN_RE.test(s)
}

function isYear (n) {
  return Number.isInteger(n) && n >= 1900 && n <= 9999
}

function isNonNegativeInt (n) {
  return Number.isInteger(n) && n >= 0
}

function isNonEmptyString (s) {
  return typeof s === 'string' && s.trim().length > 0
}

function rowToEntry (row) {
  return {
    id: row.id,
    periodId: row.period_id,
    bulan: row.bulan,
    location: row.location,
    sesi: row.sesi,
    category: row.category,
    title: row.title,
    quantity: row.quantity,
  }
}

// ---- Read side ------------------------------------------------------------

/**
 * GET /api/summary/kdtu?year=YYYY
 * Returns { months: [...], entries: [...] } where months is one row per
 * YYYY-MM that exists in the table (with totals across categories) and
 * entries is the raw row list for the year (drill-down source).
 */
export function listSummaryByYear (db, year) {
  if (!isYear(Number(year))) {
    throw new ValidationError('Invalid year', { year: 'must be a 4-digit integer' })
  }
  const prefix = `${year}-`
  const monthRows = db.prepare(`
    SELECT bulan,
           SUM(CASE WHEN category = 'Majalah' THEN quantity ELSE 0 END) AS majalah,
           SUM(CASE WHEN category = 'Risalah' THEN quantity ELSE 0 END) AS risalah,
           SUM(CASE WHEN category = 'Buku'    THEN quantity ELSE 0 END) AS buku,
           SUM(CASE WHEN category = 'Brosur'  THEN quantity ELSE 0 END) AS brosur,
           SUM(CASE WHEN category = 'Lainnya' THEN quantity ELSE 0 END) AS lainnya,
           SUM(quantity) AS total
      FROM kdtu_summary_entries
     WHERE bulan LIKE ?
     GROUP BY bulan
     ORDER BY bulan ASC
  `).all(`${prefix}%`)

  const entryRows = db.prepare(`
    SELECT id, period_id, bulan, location, sesi, title, category, quantity
      FROM kdtu_summary_entries
     WHERE bulan LIKE ?
     ORDER BY bulan ASC, location ASC, id ASC
  `).all(`${prefix}%`)

  return {
    months: monthRows.map(r => ({
      month: r.bulan,
      majalah: r.majalah,
      risalah: r.risalah,
      buku: r.buku,
      brosur: r.brosur,
      lainnya: r.lainnya,
      total: r.total,
    })),
    entries: entryRows.map(rowToEntry),
  }
}

/**
 * GET /api/summary/kdtu/:bulan  where bulan = 'YYYY-MM'
 * Returns the raw entries for that month.
 */
export function listSummaryByMonth (db, bulan) {
  if (!isBulan(bulan)) {
    throw new ValidationError('Invalid bulan — expected YYYY-MM', { bulan: 'expected YYYY-MM' })
  }
  const rows = db.prepare(`
    SELECT id, period_id, bulan, location, sesi, title, category, quantity
      FROM kdtu_summary_entries
     WHERE bulan = ?
     ORDER BY location ASC, id ASC
  `).all(bulan)
  return rows.map(rowToEntry)
}

// ---- Write side -----------------------------------------------------------

function validateEntryInput (input, { partial = false } = {}) {
  const fields = {}
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Body must be a JSON object')
  }
  if (!partial || 'periodId' in input) {
    if (!Number.isInteger(input.periodId) || input.periodId <= 0) {
      fields.periodId = 'must be a positive integer'
    }
  }
  if (!partial || 'bulan' in input) {
    if (!isBulan(input.bulan)) {
      fields.bulan = 'must be in YYYY-MM format'
    }
  }
  if (!partial || 'location' in input) {
    if (!isNonEmptyString(input.location) || input.location.length > 200) {
      fields.location = 'must be a non-empty string <= 200 chars'
    }
  }
  if (!partial || 'sesi' in input) {
    if (!isNonEmptyString(input.sesi) || input.sesi.length > 200) {
      fields.sesi = 'must be a non-empty string <= 200 chars'
    }
  }
  if (!partial || 'category' in input) {
    if (!VALID_CATEGORIES.has(input.category)) {
      fields.category = 'must be one of Majalah|Risalah|Buku|Brosur|Lainnya'
    }
  }
  if (!partial || 'title' in input) {
    if (!isNonEmptyString(input.title) || input.title.length > 200) {
      fields.title = 'must be a non-empty string <= 200 chars'
    }
  }
  if (!partial || 'quantity' in input) {
    if (input.quantity === undefined || input.quantity === null || !isNonNegativeInt(input.quantity)) {
      fields.quantity = 'must be a non-negative integer'
    }
  }
  if (Object.keys(fields).length) {
    throw new ValidationError('Invalid input', fields)
  }
}

function ensurePeriodExists (db, periodId) {
  const row = db.prepare('SELECT id FROM timetable_periods WHERE id = ?').get(periodId)
  if (!row) throw new NotFoundError(`Period ${periodId} not found`)
}

export function createEntry (db, input) {
  validateEntryInput(input, { partial: false })
  ensurePeriodExists(db, input.periodId)
  const info = db.prepare(`
    INSERT INTO kdtu_summary_entries
      (period_id, bulan, location, sesi, category, title, quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.periodId,
    input.bulan,
    input.location.trim(),
    input.sesi.trim(),
    input.category,
    input.title.trim(),
    input.quantity,
  )
  return getEntry(db, Number(info.lastInsertRowid))
}

export function getEntry (db, id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid entry id', { id: 'must be a positive integer' })
  }
  const row = db.prepare(`
    SELECT id, period_id, bulan, location, sesi, title, category, quantity
      FROM kdtu_summary_entries WHERE id = ?
  `).get(id)
  if (!row) throw new NotFoundError(`Entry ${id} not found`)
  return rowToEntry(row)
}

export function updateEntry (db, id, patch) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid entry id', { id: 'must be a positive integer' })
  }
  const existing = getEntry(db, id)
  validateEntryInput(patch, { partial: true })

  const next = {
    periodId: 'periodId' in patch ? patch.periodId : existing.periodId,
    bulan:    'bulan'    in patch ? patch.bulan    : existing.bulan,
    location: 'location' in patch ? patch.location.trim() : existing.location,
    sesi:     'sesi'     in patch ? patch.sesi.trim()     : existing.sesi,
    category: 'category' in patch ? patch.category : existing.category,
    title:    'title'    in patch ? patch.title.trim()    : existing.title,
    quantity: 'quantity' in patch ? patch.quantity : existing.quantity,
  }

  if ('periodId' in patch) ensurePeriodExists(db, next.periodId)

  db.prepare(`
    UPDATE kdtu_summary_entries
       SET period_id = ?, bulan = ?, location = ?, sesi = ?,
           category = ?, title = ?, quantity = ?
     WHERE id = ?
  `).run(next.periodId, next.bulan, next.location, next.sesi,
         next.category, next.title, next.quantity, id)
  return getEntry(db, id)
}

export function deleteEntry (db, id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid entry id', { id: 'must be a positive integer' })
  }
  const info = db.prepare('DELETE FROM kdtu_summary_entries WHERE id = ?').run(id)
  if (!info.changes) throw new NotFoundError(`Entry ${id} not found`)
}