// publicationsService — pure CRUD for the publications catalogue and its
// join with timetable_periods (the timetable_publications rows that say
// "at this period's sessions, distribute N copies of publication X").
//
// Throws domain errors: NotFoundError, ValidationError, ConflictError. The
// routes layer translates these to HTTP responses (see routes/publications.js).
//
// Schema reference: server/src/db/schema.sql
//   publications(id, category CHECK, stock INTEGER, edition NULLABLE,
//                UNIQUE(category, title, edition))
//   timetable_publications(period_id FK, publication_id FK, quantity INT,
//                PRIMARY KEY(period_id, publication_id))

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

export class ConflictError extends Error {
  constructor (message) {
    super(message)
    this.name = 'ConflictError'
    this.code = 'CONFLICT'
  }
}

const VALID_CATEGORIES = new Set(Object.values(PUBLICATION_CATEGORY))

function isNonNegativeInt (n) {
  return Number.isInteger(n) && n >= 0
}

function isNonEmptyString (s) {
  return typeof s === 'string' && s.trim().length > 0
}

// Map a DB row to the API shape.
function rowToPublication (row) {
  if (!row) return null
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    edition: row.edition ?? null,
    stock: row.stock,
  }
}

export function listPublications (db, { category, q } = {}) {
  const clauses = []
  const params = []
  if (category !== undefined && category !== null && category !== '') {
    if (!VALID_CATEGORIES.has(category)) {
      throw new ValidationError(`Invalid category: ${category}`, { category: 'unknown category' })
    }
    clauses.push('category = ?')
    params.push(category)
  }
  if (q !== undefined && q !== null && String(q).trim() !== '') {
    clauses.push('(title LIKE ? OR edition LIKE ?)')
    const like = `%${String(q).trim()}%`
    params.push(like, like)
  }
  const sql = 'SELECT id, category, title, edition, stock FROM publications' +
    (clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '') +
    ' ORDER BY category ASC, title ASC'
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToPublication)
}

export function getPublication (db, id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid publication id', { id: 'must be a positive integer' })
  }
  const row = db.prepare('SELECT id, category, title, edition, stock FROM publications WHERE id = ?').get(id)
  if (!row) throw new NotFoundError(`Publication ${id} not found`)
  return rowToPublication(row)
}

function validatePublicationInput (input, { partial = false } = {}) {
  const fields = {}
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Body must be a JSON object')
  }
  // category
  if (!partial || 'category' in input) {
    if (!VALID_CATEGORIES.has(input.category)) {
      fields.category = 'must be one of Majalah|Risalah|Buku|Brosur|Lainnya'
    }
  }
  // title
  if (!partial || 'title' in input) {
    if (!isNonEmptyString(input.title)) {
      fields.title = 'title is required'
    } else if (input.title.length > 200) {
      fields.title = 'title must be <= 200 chars'
    }
  }
  // edition (optional, but if present must be a non-empty string or null)
  if ('edition' in input && input.edition !== null && input.edition !== undefined) {
    if (typeof input.edition !== 'string' || input.edition.trim() === '') {
      fields.edition = 'edition must be a non-empty string or null'
    } else if (input.edition.length > 200) {
      fields.edition = 'edition must be <= 200 chars'
    }
  }
  // stock
  if (!partial || 'stock' in input) {
    if (input.stock !== undefined && input.stock !== null && !isNonNegativeInt(input.stock)) {
      fields.stock = 'stock must be a non-negative integer'
    }
  }
  if (Object.keys(fields).length) {
    throw new ValidationError('Invalid input', fields)
  }
}

export function createPublication (db, input) {
  validatePublicationInput(input, { partial: false })
  const edition = input.edition && input.edition.trim() ? input.edition.trim() : null
  const stock = input.stock ?? 0
  try {
    const info = db.prepare(
      'INSERT INTO publications (category, title, edition, stock) VALUES (?, ?, ?, ?)'
    ).run(input.category, input.title.trim(), edition, stock)
    return getPublication(db, info.lastInsertRowid)
  } catch (err) {
    // UNIQUE(category, title, edition) violation
    if (err && /UNIQUE.*constraint failed/i.test(err.message || '')) {
      throw new ConflictError(`Publication already exists for category=${input.category} title="${input.title}" edition=${edition ?? '∅'}`)
    }
    throw err
  }
}

export function updatePublication (db, id, patch) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid publication id', { id: 'must be a positive integer' })
  }
  // Ensure row exists.
  const existing = db.prepare('SELECT id, category, title, edition, stock FROM publications WHERE id = ?').get(id)
  if (!existing) throw new NotFoundError(`Publication ${id} not found`)

  validatePublicationInput(patch, { partial: true })

  const next = {
    category: 'category' in patch ? patch.category : existing.category,
    title: 'title' in patch ? patch.title.trim() : existing.title,
    edition: 'edition' in patch
      ? (patch.edition && patch.edition.trim() ? patch.edition.trim() : null)
      : existing.edition,
    stock: 'stock' in patch ? patch.stock : existing.stock,
  }

  try {
    db.prepare('UPDATE publications SET category = ?, title = ?, edition = ?, stock = ? WHERE id = ?')
      .run(next.category, next.title, next.edition, next.stock, id)
  } catch (err) {
    if (err && /UNIQUE.*constraint failed/i.test(err.message || '')) {
      throw new ConflictError(`Publication already exists for category=${next.category} title="${next.title}" edition=${next.edition ?? '∅'}`)
    }
    throw err
  }
  return getPublication(db, id)
}

export function deletePublication (db, id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid publication id', { id: 'must be a positive integer' })
  }
  const info = db.prepare('DELETE FROM publications WHERE id = ?').run(id)
  if (!info.changes) throw new NotFoundError(`Publication ${id} not found`)
}

// ---- timetable_publications (join) ---------------------------------------

function ensurePeriodExists (db, periodId) {
  if (!Number.isInteger(periodId) || periodId <= 0) {
    throw new ValidationError('Invalid periodId', { periodId: 'must be a positive integer' })
  }
  const row = db.prepare('SELECT id FROM timetable_periods WHERE id = ?').get(periodId)
  if (!row) throw new NotFoundError(`Period ${periodId} not found`)
}

function validateQuantity (qty, fieldName = 'quantity') {
  if (!Number.isInteger(qty) || qty < 0) {
    throw new ValidationError(`Invalid ${fieldName}`, { [fieldName]: 'must be a non-negative integer' })
  }
}

export function listPeriodPublications (db, periodId) {
  ensurePeriodExists(db, periodId)
  const rows = db.prepare(`
    SELECT tp.publication_id AS publicationId,
           p.title            AS title,
           p.category         AS category,
           tp.quantity        AS quantity
      FROM timetable_publications tp
      JOIN publications p ON p.id = tp.publication_id
     WHERE tp.period_id = ?
     ORDER BY p.category ASC, p.title ASC
  `).all(periodId)
  return rows
}

export function attachPeriodPublication (db, periodId, publicationId, quantity) {
  ensurePeriodExists(db, periodId)
  if (!Number.isInteger(publicationId) || publicationId <= 0) {
    throw new ValidationError('Invalid publicationId', { publicationId: 'must be a positive integer' })
  }
  validateQuantity(quantity, 'quantity')
  // publication must exist
  const exists = db.prepare('SELECT id FROM publications WHERE id = ?').get(publicationId)
  if (!exists) throw new NotFoundError(`Publication ${publicationId} not found`)
  // Conflict if already attached
  const existing = db.prepare(
    'SELECT quantity FROM timetable_publications WHERE period_id = ? AND publication_id = ?'
  ).get(periodId, publicationId)
  if (existing) {
    throw new ConflictError(`Publication ${publicationId} already attached to period ${periodId}`)
  }
  db.prepare(
    'INSERT INTO timetable_publications (period_id, publication_id, quantity) VALUES (?, ?, ?)'
  ).run(periodId, publicationId, quantity)
  return { periodId, publicationId, quantity }
}

export function updatePeriodPublication (db, periodId, publicationId, quantity) {
  ensurePeriodExists(db, periodId)
  if (!Number.isInteger(publicationId) || publicationId <= 0) {
    throw new ValidationError('Invalid publicationId', { publicationId: 'must be a positive integer' })
  }
  validateQuantity(quantity, 'quantity')
  const info = db.prepare(
    'UPDATE timetable_publications SET quantity = ? WHERE period_id = ? AND publication_id = ?'
  ).run(quantity, periodId, publicationId)
  if (!info.changes) throw new NotFoundError(`No publication ${publicationId} attached to period ${periodId}`)
  return { periodId, publicationId, quantity }
}

export function detachPeriodPublication (db, periodId, publicationId) {
  ensurePeriodExists(db, periodId)
  if (!Number.isInteger(publicationId) || publicationId <= 0) {
    throw new ValidationError('Invalid publicationId', { publicationId: 'must be a positive integer' })
  }
  const info = db.prepare(
    'DELETE FROM timetable_publications WHERE period_id = ? AND publication_id = ?'
  ).run(periodId, publicationId)
  if (!info.changes) throw new NotFoundError(`No publication ${publicationId} attached to period ${periodId}`)
}