// /api/penugasan/* — list, create, read, update, delete, complete.
//
// Schema reference: server/src/db/schema.sql
//   penugasan(id, kdl_id FK->kdl, title, description, due_on, status, completed_at)
//   statuses: PENDING | IN_PROGRESS | DONE
//
// Error contract:
//   NotFoundError       -> 404
//   ValidationError     -> 400
//   ConflictError       -> 409
//   anything else       -> 500 (via middleware/audit.js errorHandler)

import express from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import {
  listPenugasan,
  getPenugasan,
  createPenugasan,
  updatePenugasan,
  deletePenugasan,
  completePenugasan,
  NotFoundError,
  ValidationError,
  ConflictError,
  ensureMigrations,
} from '../services/penugasanService.js'
import { ERROR_CODES, ROLE } from '@kdtu/shared'

export function createPenugasanRouter () {
  const router = express.Router()

  // Defensive: apply this module's migration on first use.
  function withDb (req) {
    const db = req.app.locals.db
    if (!db) throw new Error('db not configured on app')
    ensureMigrations(db)
    return db
  }

  // Map service errors to HTTP responses. Keeps the route bodies tiny.
  function handle (fn) {
    return (req, res, next) => {
      try {
        const out = fn(req, res)
        if (out !== undefined) res.json(out)
      } catch (err) {
        if (err instanceof NotFoundError) {
          return res.status(404).json({ error: err.code, message: err.message })
        }
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.code, message: err.message, fields: err.fields || undefined })
        }
        if (err instanceof ConflictError) {
          return res.status(409).json({ error: err.code, message: err.message })
        }
        return next(err)
      }
    }
  }

  // GET /api/penugasan — list, optional ?kdlId=N
  router.get('/', authenticate, handle((req) => {
    const db = withDb(req)
    const kdlIdRaw = req.query.kdlId
    const kdlId = kdlIdRaw === undefined ? undefined : Number(kdlIdRaw)
    if (kdlIdRaw !== undefined && (!Number.isInteger(kdlId) || kdlId <= 0)) {
      throw new ValidationError('kdlId must be a positive integer')
    }
    return listPenugasan(db, { kdlId })
  }))

  // POST /api/penugasan — admin only
  router.post('/', authenticate, requireRole(ROLE.ADMIN), handle((req) => {
    const db = withDb(req)
    return createPenugasan(db, req.body || {})
  }))

  // GET /api/penugasan/:id
  router.get('/:id', authenticate, handle((req) => {
    const db = withDb(req)
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id must be a positive integer')
    return getPenugasan(db, id)
  }))

  // PUT /api/penugasan/:id — admin only
  router.put('/:id', authenticate, requireRole(ROLE.ADMIN), handle((req) => {
    const db = withDb(req)
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id must be a positive integer')
    return updatePenugasan(db, id, req.body || {})
  }))

  // DELETE /api/penugasan/:id — admin only
  router.delete('/:id', authenticate, requireRole(ROLE.ADMIN), handle((req) => {
    const db = withDb(req)
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id must be a positive integer')
    return deletePenugasan(db, id)
  }))

  // POST /api/penugasan/:id/complete — admin only (assigned-member flow deferred).
  router.post('/:id/complete', authenticate, requireRole(ROLE.ADMIN), handle((req) => {
    const db = withDb(req)
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id must be a positive integer')
    return completePenugasan(db, id)
  }))

  return router
}

export default createPenugasanRouter