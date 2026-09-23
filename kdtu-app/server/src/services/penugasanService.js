// penugasanService — CRUD + completion for the `penugasan` table.
//
// Pure functions that take an open db handle as their first argument. Routes
// translate NotFoundError / ValidationError / ConflictError to HTTP via the
// shared error-handler pattern used elsewhere in the codebase.
//
// Schema (see server/src/db/schema.sql + migrations/004):
//   penugasan(id, kdl_id FK, title, description, due_on, status, completed_at)
//   kdl(id UNIQUE, name, leader, meeting_day)
//   statuses: PENDING | IN_PROGRESS | DONE

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ERROR_CODES } from '@kdtu/shared'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
})

export class PenugasanError extends Error {
  constructor (code, message, fields) {
    super(message)
    this.name = 'PenugasanError'
    this.code = code
    if (fields) this.fields = fields
  }
}
export class NotFoundError extends PenugasanError {
  constructor (resource) { super(ERROR_CODES.NOT_FOUND, `${resource} not found`); this.name = 'NotFoundError' }
}
export class ValidationError extends PenugasanError {
  constructor (message, fields) { super(ERROR_CODES.VALIDATION, message, fields); this.name = 'ValidationError' }
}
export class ConflictError extends PenugasanError {
  constructor (message) { super(ERROR_CODES.CONFLICT, message); this.name = 'ConflictError' }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

function isValidIsoDate (s) {
  if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function isValidIsoDateTime (s) {
  if (typeof s !== 'string' || !ISO_DATETIME_RE.test(s)) return false
  const d = new Date(s)
  return !Number.isNaN(d.getTime())
}

function validateStatus (s) {
  return Object.values(STATUS).includes(s)
}

// Ensure schema additions from migrations/*.sql are applied to a live db.
// Called once at module load (idempotent — ALTER TABLE ADD COLUMN fails
// harmlessly if the column already exists).
let _migrated = new WeakSet()
export function ensureMigrations (db) {
  if (_migrated.has(db)) return
  const dir = __dirname
  // Apply 004 (additive column) and 005 (unique index for seed idempotency).
  try {
    const sql = readFileSync(join(dir, '..', 'db', 'migrations', '004_penugasan_completed_at.sql'), 'utf8')
    db.exec(sql)
  } catch (err) {
    // Column already exists -> ignore. Any other error bubbles up.
    if (!/duplicate column name/i.test(String(err && err.message))) {
      // Not a duplicate column: rethrow.
      throw err
    }
  }
  try {
    const sql = readFileSync(join(dir, '..', 'db', 'migrations', '005_penugasan_unique.sql'), 'utf8')
    db.exec(sql)
  } catch (err) {
    // CREATE UNIQUE INDEX IF NOT EXISTS is already idempotent — rethrows only
    // on real failures (e.g. existing duplicate rows). We swallow duplicates
    // so the rest of the service stays usable; cleanup is admin's job.
    if (/UNIQUE constraint failed/i.test(String(err && err.message))) {
      // eslint-disable-next-line no-console
      console.warn('[penugasan] unique-index migration skipped: duplicate (kdl_id, title) rows exist.')
    } else {
      throw err
    }
  }
  _migrated.add(db)
}

// Map a DB row to the ApiPenugasan response shape.
function rowToApi (r) {
  if (!r) return null
  return {
    id: r.id,
    kdlId: r.kdl_id,
    title: r.title,
    description: r.description ?? null,
    dueOn: r.due_on ?? null,
    status: r.status,
    completedAt: r.completed_at ?? null,
  }
}

function kdlExists (db, kdlId) {
  const row = db.prepare('SELECT 1 FROM kdl WHERE id = ?').get(kdlId)
  return !!row
}

// ---- CRUD -----------------------------------------------------------------

export function listPenugasan (db, { kdlId } = {}) {
  if (kdlId !== undefined && kdlId !== null) {
    if (!Number.isInteger(kdlId)) throw new ValidationError('kdlId must be an integer')
    const rows = db.prepare('SELECT * FROM penugasan WHERE kdl_id = ? ORDER BY id ASC').all(kdlId)
    return rows.map(rowToApi)
  }
  const rows = db.prepare('SELECT * FROM penugasan ORDER BY id ASC').all()
  return rows.map(rowToApi)
}

export function getPenugasan (db, id) {
  if (!Number.isInteger(id)) throw new ValidationError('id must be an integer')
  const row = db.prepare('SELECT * FROM penugasan WHERE id = ?').get(id)
  if (!row) throw new NotFoundError('Penugasan')
  return rowToApi(row)
}

export function createPenugasan (db, input) {
  if (!input || typeof input !== 'object') throw new ValidationError('body required')
  const fields = {}
  const kdlId = input.kdlId
  if (!Number.isInteger(kdlId)) fields.kdlId = 'kdlId must be an integer'
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) fields.title = 'title is required'
  const description = input.description == null ? null : (typeof input.description === 'string' ? input.description : null)
  let dueOn = null
  if (input.dueOn != null) {
    if (!isValidIsoDate(input.dueOn)) fields.dueOn = 'dueOn must be an ISO date (YYYY-MM-DD)'
    else dueOn = input.dueOn
  }
  let status = STATUS.PENDING
  if (input.status != null) {
    if (!validateStatus(input.status)) fields.status = `status must be one of ${Object.values(STATUS).join(', ')}`
    else status = input.status
  }
  if (Object.keys(fields).length) throw new ValidationError('Invalid input', fields)
  if (!kdlExists(db, kdlId)) throw new NotFoundError('KDL')

  const info = db.prepare(
    'INSERT INTO penugasan (kdl_id, title, description, due_on, status) VALUES (?, ?, ?, ?, ?)'
  ).run(kdlId, title, description, dueOn, status)
  return getPenugasan(db, info.lastInsertRowid)
}

export function updatePenugasan (db, id, input) {
  if (!Number.isInteger(id)) throw new ValidationError('id must be an integer')
  if (!input || typeof input !== 'object') throw new ValidationError('body required')
  const existing = db.prepare('SELECT * FROM penugasan WHERE id = ?').get(id)
  if (!existing) throw new NotFoundError('Penugasan')

  const fields = {}
  const patch = {}
  if ('kdlId' in input) {
    if (!Number.isInteger(input.kdlId)) fields.kdlId = 'kdlId must be an integer'
    else if (!kdlExists(db, input.kdlId)) throw new NotFoundError('KDL')
    else patch.kdl_id = input.kdlId
  }
  if ('title' in input) {
    const t = typeof input.title === 'string' ? input.title.trim() : ''
    if (!t) fields.title = 'title is required'
    else patch.title = t
  }
  if ('description' in input) {
    patch.description = input.description == null ? null : (typeof input.description === 'string' ? input.description : null)
  }
  if ('dueOn' in input) {
    if (input.dueOn == null) patch.due_on = null
    else if (!isValidIsoDate(input.dueOn)) fields.dueOn = 'dueOn must be an ISO date (YYYY-MM-DD)'
    else patch.due_on = input.dueOn
  }
  if ('status' in input) {
    if (!validateStatus(input.status)) fields.status = `status must be one of ${Object.values(STATUS).join(', ')}`
    else {
      patch.status = input.status
      // Moving into DONE without /complete is allowed; stamp completed_at.
      if (input.status === STATUS.DONE && !existing.completed_at) patch.completed_at = new Date().toISOString()
      if (input.status !== STATUS.DONE && existing.completed_at) patch.completed_at = null
    }
  }
  if (Object.keys(fields).length) throw new ValidationError('Invalid input', fields)
  if (Object.keys(patch).length === 0) return rowToApi(existing)

  const sets = Object.keys(patch).map(k => `${k} = ?`).join(', ')
  const values = Object.values(patch)
  db.prepare(`UPDATE penugasan SET ${sets} WHERE id = ?`).run(...values, id)
  return getPenugasan(db, id)
}

export function deletePenugasan (db, id) {
  if (!Number.isInteger(id)) throw new ValidationError('id must be an integer')
  const info = db.prepare('DELETE FROM penugasan WHERE id = ?').run(id)
  if (info.changes === 0) throw new NotFoundError('Penugasan')
  return { ok: true }
}

export function completePenugasan (db, id) {
  if (!Number.isInteger(id)) throw new ValidationError('id must be an integer')
  const existing = db.prepare('SELECT * FROM penugasan WHERE id = ?').get(id)
  if (!existing) throw new NotFoundError('Penugasan')
  const completedAt = new Date().toISOString()
  db.prepare("UPDATE penugasan SET status = ?, completed_at = ? WHERE id = ?").run(STATUS.DONE, completedAt, id)
  return getPenugasan(db, id)
}

// ---- Seed -----------------------------------------------------------------
//
// Hard-coded data mirroring the photographed notice board (WhatsApp Image
// 2026-09-20 at 21.31.50.jpeg). The user can edit/delete these later from the
// admin UI. PIC names are drawn from the KDTU participants sheet.
//
// Idempotent: (kdl_id, title) is unique via INSERT OR IGNORE — re-running does
// not produce duplicates.

const SEED_ITEMS = [
  { title: 'Latihan Berbicara',     status: STATUS.DONE,         dueOn: '2026-09-13', description: 'PIC: Sdri. Zelza' },
  { title: 'Penyiapan Tempat',      status: STATUS.DONE,         dueOn: '2026-09-14', description: 'PIC: Bpk. Hendra' },
  { title: 'Kebaktian Keluarga',    status: STATUS.IN_PROGRESS,  dueOn: '2026-09-21', description: 'PIC: Sdri. Friska' },
  { title: 'Pembuatan Poster',      status: STATUS.PENDING,      dueOn: '2026-09-26', description: 'PIC: Sdr. Joshua' },
  { title: 'Laporan Bulanan',       status: STATUS.PENDING,      dueOn: '2026-09-30', description: 'PIC: Bpk. Dody' },
  { title: 'Penyiapan Rak Beroda',  status: STATUS.IN_PROGRESS,  dueOn: '2026-09-22', description: 'PIC: Sdri. Eka' },
  { title: 'Pembagian Brosur',      status: STATUS.PENDING,      dueOn: '2026-09-28', description: 'PIC: Sdr. Nico' },
  { title: 'Latihan Presentasi',    status: STATUS.PENDING,      dueOn: '2026-10-04', description: 'PIC: Sdri. Amanda' },
]

export function seedPenugasanDataFromImage (db, { kdlId = 1 } = {}) {
  // Ensure the additive migration for `completed_at` is applied before we
  // INSERT with that column. Safe to call repeatedly (idempotent).
  ensureMigrations(db)

  // Ensure the target KDL exists. INSERT OR IGNORE makes this safe to re-run.
  db.prepare(
    "INSERT OR IGNORE INTO kdl (id, name, leader, meeting_day) VALUES (?, ?, NULL, NULL)"
  ).run(kdlId, 'KDL 1 — Srengseng')

  const insert = db.prepare(
    "INSERT OR IGNORE INTO penugasan (kdl_id, title, description, due_on, status, completed_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
  const inserted = []
  const tx = db.transaction((items) => {
    for (const it of items) {
      const completedAt = it.status === STATUS.DONE ? new Date().toISOString() : null
      const info = insert.run(kdlId, it.title, it.description ?? null, it.dueOn ?? null, it.status, completedAt)
      if (info.changes > 0) {
        inserted.push(info.lastInsertRowid)
      }
    }
  })
  tx(SEED_ITEMS)
  // Return the *current* rows for this KDL so callers can verify the seed.
  const rows = db.prepare('SELECT * FROM penugasan WHERE kdl_id = ? ORDER BY id ASC').all(kdlId)
  return rows.map(rowToApi)
}

// Re-export date validator for tests.
export const _internal = { isValidIsoDate, isValidIsoDateTime }
