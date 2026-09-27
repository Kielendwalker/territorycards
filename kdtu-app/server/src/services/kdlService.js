// kdlService — KDL (Kelompok Pelayanan) CRUD + member attach/detach +
// passthrough penugasan lookup for a KDL.
//
// Pure functions. Routes translate thrown errors to HTTP via the shared
// error-shape used everywhere else (see server/src/middleware/audit.js).
//
// Schema reference:
//   kdl(id, name UNIQUE, leader, meeting_day, meeting_time, location, announcements)
//   members(id, name_enc, phone_enc, pin_hash, kdl_id REFERENCES kdl(id) ON DELETE SET NULL, active, ...)
//   penugasan(id, kdl_id REFERENCES kdl(id) ON DELETE CASCADE, title, description, due_on, status)
//
// Seed data below mirrors the photo "WhatsApp Image 2026-09-20 at 21.31.34.jpeg"
// showing the Sidang Jakarta Srengseng KDL board. Admin can edit/delete any of
// these rows afterwards; treat the seed as provisional.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATION_PATH = join(__dirname, '..', 'db', 'migrations', '003_kdl_extra.sql')

export class ValidationError extends Error {
  constructor (message, fields) {
    super(message)
    this.name = 'ValidationError'
    this.code = 'VALIDATION'
    this.fields = fields || null
  }
}
export class NotFoundError extends Error {
  constructor (message) {
    super(message)
    this.name = 'NotFoundError'
    this.code = 'NOT_FOUND'
  }
}
export class ConflictError extends Error {
  constructor (message) {
    super(message)
    this.name = 'ConflictError'
    this.code = 'CONFLICT'
  }
}

// Apply the KDL-extra migration. Idempotent (ALTER TABLE … ADD COLUMN will
// throw on the second run with "duplicate column name", which we swallow).
// Called from the service bootstrap so that we don't have to touch sub-agent
// F's schema.sql.
export function ensureKdlSchema (db) {
  const sql = readFileSync(MIGRATION_PATH, 'utf8')
  for (const stmt of sql.split(/;\s*\n?/).map(s => s.trim()).filter(Boolean)) {
    try {
      db.exec(stmt + ';')
    } catch (err) {
      if (!/duplicate column name/i.test(err.message)) throw err
    }
  }
}

// Seed data — best-effort interpretation of the photographed KDL board for
// Sidang Jakarta Srengseng. Names match the visible rows; meetingDay/Time,
// location and announcements are read directly from the image. Admin can
// edit or delete these rows later.
const SEED_KDLS = [
  {
    name: 'KDL 1 — Srengseng',
    leader: 'Sdri. Zelza',
    meetingDay: 'Sabtu',
    meetingTime: '15:00',
    location: 'Rumah Sdri. Zelza',
    announcements: 'Tugas khusus: Pembagian Brosur 5 RW 4 daerah Srengseng',
  },
  {
    name: 'KDL 2 — Kebon Jeruk',
    leader: 'Sdr. Hizkia',
    meetingDay: 'Sabtu',
    meetingTime: '15:30',
    location: 'Rumah Sdr. Hizkia',
    announcements: 'Pembuatan Video Pendek bersama dengan KDL 4',
  },
  {
    name: 'KDL 3 — Pos Pengampuan',
    leader: 'Sdr. Bara',
    meetingDay: 'Sabtu',
    meetingTime: '16:00',
    location: 'Rumah Sdr. Bara',
    announcements: 'Pembagian Brosur 5 RW 4 daerah Pos Pengampuan',
  },
  {
    name: 'KDL 4 — Meruya Ilir',
    leader: 'Sdri. Yuli',
    meetingDay: 'Minggu',
    meetingTime: '14:00',
    location: 'Rumah Sdri. Yuli',
    announcements: 'Pembuatan Video Pendek bersama dengan KDL 2',
  },
]

// Insert the seed KDLs if the table is empty. Idempotent: re-running is a
// no-op. Called from bootstrap so the system has realistic starter data the
// first time it comes up.
export function seedKdlDataFromImage (db) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM kdl').get()
  if (row.n > 0) return 0
  const insert = db.prepare(
    `INSERT INTO kdl (name, leader, meeting_day, meeting_time, location, announcements)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  let inserted = 0
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      insert.run(r.name, r.leader || null, r.meetingDay || null, r.meetingTime || null, r.location || null, r.announcements || null)
      inserted += 1
    }
  })
  tx(SEED_KDLS)
  return inserted
}

// One-shot bootstrap: ensure columns + seed if empty.
export function bootstrapKdl (db) {
  ensureKdlSchema(db)
  return seedKdlDataFromImage(db)
}

// ---- Validators -----------------------------------------------------------

function validateName (name) {
  if (typeof name !== 'string' || name.trim().length < 2) {
    throw new ValidationError('name must be at least 2 characters', { name: 'min 2 chars' })
  }
  if (name.length > 200) {
    throw new ValidationError('name must be at most 200 characters', { name: 'max 200 chars' })
  }
}

function validateOptionalText (val, field, max = 500) {
  if (val === undefined || val === null) return null
  if (typeof val !== 'string') {
    throw new ValidationError(`${field} must be a string`, { [field]: 'must be string' })
  }
  if (val.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`, { [field]: `max ${max} chars` })
  }
  return val
}

// ---- CRUD ----------------------------------------------------------------

export function listKdl (db) {
  const rows = db.prepare(
    `SELECT k.id, k.name, k.leader, k.meeting_day AS meetingDay,
            k.meeting_time AS meetingTime, k.location, k.announcements,
            (SELECT COUNT(*) FROM members m WHERE m.kdl_id = k.id AND m.active = 1) AS memberCount
       FROM kdl k
      ORDER BY k.id ASC`
  ).all()
  return rows.map(toApiKdl)
}

function toApiKdl (row) {
  return {
    id: row.id,
    name: row.name,
    leader: row.leader ?? null,
    meetingDay: row.meetingDay ?? null,
    meetingTime: row.meetingTime ?? null,
    location: row.location ?? null,
    announcements: row.announcements ?? null,
    memberCount: row.memberCount ?? 0,
  }
}

function rowToKdlWithCount (db, id) {
  return db.prepare(
    `SELECT k.id, k.name, k.leader, k.meeting_day AS meetingDay,
            k.meeting_time AS meetingTime, k.location, k.announcements,
            (SELECT COUNT(*) FROM members m WHERE m.kdl_id = k.id AND m.active = 1) AS memberCount
       FROM kdl k WHERE k.id = ?`
  ).get(id)
}

export function getKdl (db, id) {
  const kdl = rowToKdlWithCount(db, id)
  if (!kdl) throw new NotFoundError(`KDL ${id} not found`)
  const members = db.prepare(
    `SELECT id, active FROM members WHERE kdl_id = ? ORDER BY id ASC`
  ).all(id)
  return { ...toApiKdl(kdl), members: members.map(m => ({ id: m.id, active: !!m.active })) }
}

export function createKdl (db, input) {
  validateName(input?.name)
  const leader = validateOptionalText(input.leader, 'leader', 200)
  const meetingDay = validateOptionalText(input.meetingDay, 'meetingDay', 40)
  const meetingTime = validateOptionalText(input.meetingTime, 'meetingTime', 20)
  const location = validateOptionalText(input.location, 'location', 200)
  const announcements = validateOptionalText(input.announcements, 'announcements', 5000)

  // Check uniqueness ahead of the INSERT so we can throw a typed ConflictError.
  const dup = db.prepare('SELECT id FROM kdl WHERE name = ?').get(input.name.trim())
  if (dup) throw new ConflictError(`KDL name "${input.name}" already exists`)

  const info = db.prepare(
    `INSERT INTO kdl (name, leader, meeting_day, meeting_time, location, announcements)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(input.name.trim(), leader, meetingDay, meetingTime, location, announcements)
  return toApiKdl(rowToKdlWithCount(db, info.lastInsertRowid))
}

export function updateKdl (db, id, input) {
  const existing = rowToKdlWithCount(db, id)
  if (!existing) throw new NotFoundError(`KDL ${id} not found`)

  const fields = {}
  if (input.name !== undefined) {
    validateName(input.name)
    if (input.name.trim() !== existing.name) {
      const dup = db.prepare('SELECT id FROM kdl WHERE name = ? AND id <> ?').get(input.name.trim(), id)
      if (dup) throw new ConflictError(`KDL name "${input.name}" already exists`)
    }
    fields.name = input.name.trim()
  }
  for (const [key, max] of [['leader', 200], ['meetingDay', 40], ['meetingTime', 20], ['location', 200], ['announcements', 5000]]) {
    if (input[key] !== undefined) fields[key] = validateOptionalText(input[key], key, max)
  }
  if (Object.keys(fields).length === 0) {
    return toApiKdl(existing)
  }
  const setSql = Object.keys(fields).map(k => `${camelToSnake(k)} = ?`).join(', ')
  const values = Object.values(fields)
  db.prepare(`UPDATE kdl SET ${setSql} WHERE id = ?`).run(...values, id)
  return toApiKdl(rowToKdlWithCount(db, id))
}

function camelToSnake (s) {
  return s.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
}

export function deleteKdl (db, id) {
  const existing = db.prepare('SELECT id FROM kdl WHERE id = ?').get(id)
  if (!existing) throw new NotFoundError(`KDL ${id} not found`)
  // FK ON DELETE SET NULL takes care of members.kdl_id.
  db.prepare('DELETE FROM kdl WHERE id = ?').run(id)
  return { ok: true, id }
}

// ---- Members attach/detach ----------------------------------------------

export function listKdlMembers (db, kdlId) {
  const kdl = db.prepare('SELECT id FROM kdl WHERE id = ?').get(kdlId)
  if (!kdl) throw new NotFoundError(`KDL ${kdlId} not found`)
  return db.prepare(
    `SELECT id, active, kdl_id AS kdlId FROM members WHERE kdl_id = ? ORDER BY id ASC`
  ).all(kdlId).map(m => ({ id: m.id, active: !!m.active, kdlId: m.kdlId }))
}

export function attachMember (db, kdlId, memberId) {
  if (!Number.isInteger(memberId)) throw new ValidationError('memberId must be an integer', { memberId: 'integer' })
  const kdl = db.prepare('SELECT id FROM kdl WHERE id = ?').get(kdlId)
  if (!kdl) throw new NotFoundError(`KDL ${kdlId} not found`)
  const member = db.prepare('SELECT id FROM members WHERE id = ?').get(memberId)
  if (!member) throw new NotFoundError(`Member ${memberId} not found`)
  // Idempotent attach.
  db.prepare('UPDATE members SET kdl_id = ? WHERE id = ?').run(kdlId, memberId)
  return { ok: true, kdlId, memberId }
}

export function detachMember (db, kdlId, memberId) {
  if (!Number.isInteger(memberId)) throw new ValidationError('memberId must be an integer', { memberId: 'integer' })
  const kdl = db.prepare('SELECT id FROM kdl WHERE id = ?').get(kdlId)
  if (!kdl) throw new NotFoundError(`KDL ${kdlId} not found`)
  const member = db.prepare('SELECT id, kdl_id FROM members WHERE id = ?').get(memberId)
  if (!member) throw new NotFoundError(`Member ${memberId} not found`)
  if (member.kdl_id !== kdlId) {
    throw new ValidationError(`Member ${memberId} is not in KDL ${kdlId}`, { memberId: 'not attached' })
  }
  db.prepare('UPDATE members SET kdl_id = NULL WHERE id = ?').run(memberId)
  return { ok: true, kdlId, memberId }
}

// ---- Penugasan passthrough ----------------------------------------------
// Sub-agent C owns the Penugasan feature. For the KDL→Penugasan view we only
// return the rows that are visible to the caller; no validation here beyond
// checking the KDL exists.

export function listPenugasanForKdl (db, kdlId) {
  const kdl = db.prepare('SELECT id FROM kdl WHERE id = ?').get(kdlId)
  if (!kdl) throw new NotFoundError(`KDL ${kdlId} not found`)
  return db.prepare(
    `SELECT id, kdl_id AS kdlId, title, description, due_on AS dueOn, status
       FROM penugasan WHERE kdl_id = ? ORDER BY id ASC`
  ).all(kdlId)
}
