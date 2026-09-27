// /api/timetable/periods/* — CRUD for the timetable period master data.
//
// A period is one calendar month (or named range) that groups KDTU assignments
// + summary entries. The seed inserts "Januari 2026" .. "September 2026" but
// operators need to create "Oktober 2026" (the upcoming month) and beyond.
//
// All endpoints require admin auth; the public kdtu front-end has its own
// read-only endpoint (kdtu/src/api/...) which calls this same router after
// the admin drops the auth requirement.
//
// Schema reference: server/src/db/schema.sql
//   timetable_periods(id PK, label UNIQUE, starts_on, ends_on, notes)

import express from 'express'
import { z } from 'zod'
import { ERROR_CODES, ROLE } from '@kdtu/shared'
import { authenticate, requireRole } from '../middleware/auth.js'

const idParam = z.object({
  id: z.coerce.number().int().positive(),
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

const createBody = z.object({
  label: z.string().min(1).max(200),
  startsOn: isoDate,
  endsOn: isoDate,
  notes: z.union([z.string().max(5000), z.null()]).optional(),
})

const updateBody = z.object({
  label: z.string().min(1).max(200).optional(),
  startsOn: isoDate.optional(),
  endsOn: isoDate.optional(),
  notes: z.union([z.string().max(5000), z.null()]).optional(),
}).refine((obj) => Object.keys(obj).length > 0, { message: 'patch must not be empty' })

function zodBadInput (res, error) {
  const fields = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] = issue.message
  }
  return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'Invalid input', fields })
}

function rowToPeriod (row) {
  if (!row) return null
  return {
    id: row.id,
    label: row.label,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    notes: row.notes ?? null,
  }
}

export function createPeriodsRouter () {
  const router = express.Router()

  // GET /api/timetable/periods — list all periods ordered by starts_on DESC.
  // Public so the kdtu front-end can pick "the current/next period" without
  // an admin session. (Writes below still require admin.)
  router.get('/', (req, res) => {
    const db = req.app.locals.db
    const rows = db.prepare(
      'SELECT id, label, starts_on, ends_on, notes FROM timetable_periods ORDER BY starts_on DESC, id DESC'
    ).all()
    res.json(rows.map(rowToPeriod))
  })

  router.get('/:id', (req, res) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    const row = req.app.locals.db.prepare(
      'SELECT id, label, starts_on, ends_on, notes FROM timetable_periods WHERE id = ?'
    ).get(parsed.data.id)
    if (!row) return res.status(404).json({ error: ERROR_CODES.NOT_FOUND, message: 'Period not found' })
    res.json(rowToPeriod(row))
  })

  router.post('/', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    const { label, startsOn, endsOn, notes = null } = parsed.data
    if (new Date(endsOn) < new Date(startsOn)) {
      return res.status(400).json({
        error: ERROR_CODES.VALIDATION,
        message: 'Invalid input',
        fields: { endsOn: 'must be on or after startsOn' },
      })
    }
    const db = req.app.locals.db
    const dup = db.prepare('SELECT id FROM timetable_periods WHERE label = ?').get(label)
    if (dup) {
      return res.status(409).json({ error: ERROR_CODES.CONFLICT, message: `Period label "${label}" already exists` })
    }
    const info = db.prepare(
      'INSERT INTO timetable_periods (label, starts_on, ends_on, notes) VALUES (?, ?, ?, ?)'
    ).run(label, startsOn, endsOn, notes)
    const row = db.prepare(
      'SELECT id, label, starts_on, ends_on, notes FROM timetable_periods WHERE id = ?'
    ).get(info.lastInsertRowid)
    res.status(201).json(rowToPeriod(row))
  })

  router.put('/:id', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const idParsed = idParam.safeParse(req.params)
    if (!idParsed.success) return zodBadInput(res, idParsed.error)
    const bodyParsed = updateBody.safeParse(req.body)
    if (!bodyParsed.success) return zodBadInput(res, bodyParsed.error)
    const db = req.app.locals.db
    const id = idParsed.data.id
    const existing = db.prepare(
      'SELECT id, label, starts_on, ends_on, notes FROM timetable_periods WHERE id = ?'
    ).get(id)
    if (!existing) return res.status(404).json({ error: ERROR_CODES.NOT_FOUND, message: 'Period not found' })
    const patch = bodyParsed.data
    if (patch.label !== undefined && patch.label !== existing.label) {
      const dup = db.prepare('SELECT id FROM timetable_periods WHERE label = ? AND id <> ?').get(patch.label, id)
      if (dup) {
        return res.status(409).json({ error: ERROR_CODES.CONFLICT, message: `Period label "${patch.label}" already exists` })
      }
    }
    const next = {
      label: patch.label ?? existing.label,
      starts_on: patch.startsOn ?? existing.starts_on,
      ends_on: patch.endsOn ?? existing.ends_on,
      notes: patch.notes !== undefined ? patch.notes : existing.notes,
    }
    if (new Date(next.ends_on) < new Date(next.starts_on)) {
      return res.status(400).json({
        error: ERROR_CODES.VALIDATION,
        message: 'Invalid input',
        fields: { endsOn: 'must be on or after startsOn' },
      })
    }
    db.prepare(
      'UPDATE timetable_periods SET label = ?, starts_on = ?, ends_on = ?, notes = ? WHERE id = ?'
    ).run(next.label, next.starts_on, next.ends_on, next.notes, id)
    const row = db.prepare(
      'SELECT id, label, starts_on, ends_on, notes FROM timetable_periods WHERE id = ?'
    ).get(id)
    res.json(rowToPeriod(row))
  })

  router.delete('/:id', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    const db = req.app.locals.db
    const info = db.prepare('DELETE FROM timetable_periods WHERE id = ?').run(parsed.data.id)
    if (info.changes === 0) {
      return res.status(404).json({ error: ERROR_CODES.NOT_FOUND, message: 'Period not found' })
    }
    res.status(204).end()
  })

  return router
}

export default createPeriodsRouter