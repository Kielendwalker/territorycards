// /api/kdl/* — KDL CRUD, member attach/detach, and penugasan passthrough.
//
// Thin translation layer over kdlService.js. All errors thrown by the
// service are mapped to the standard { error, message, fields? } shape used
// everywhere else in the API (see server/src/middleware/audit.js +
// routes/auth.js).

import express from 'express'
import { ERROR_CODES, ROLE } from '@kdtu/shared'
import { authenticate, requireRole } from '../middleware/auth.js'
import * as svc from '../services/kdlService.js'

function handleError (res, err) {
  if (err && err.code === ERROR_CODES.NOT_FOUND) {
    return res.status(404).json({ error: ERROR_CODES.NOT_FOUND, message: err.message })
  }
  if (err && err.code === ERROR_CODES.CONFLICT) {
    return res.status(409).json({ error: ERROR_CODES.CONFLICT, message: err.message })
  }
  if (err && err.code === ERROR_CODES.VALIDATION) {
    return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: err.message, fields: err.fields || undefined })
  }
  // Re-throw so the global errorHandler picks it up.
  throw err
}

function parseId (raw) {
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

export function createKdlRouter () {
  const router = express.Router()

  // Bootstrap is idempotent — safe to call on every mount. The service is
  // imported lazily so the tests can swap the DB handle first.
  function db (req) { return req.app.locals.db }

  router.use((req, _res, next) => {
    try { svc.bootstrapKdl(db(req)) } catch (e) { /* swallow: columns already exist */ }
    next()
  })

  // GETs are public so the kdtu front-end can show the KDL board without a
  // login. Writes are admin-only.
  router.get('/', (req, res) => {
    try {
      res.json(svc.listKdl(db(req)))
    } catch (e) { handleError(res, e) }
  })

  router.post('/', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    try {
      const created = svc.createKdl(db(req), req.body || {})
      res.status(201).json(created)
    } catch (e) { handleError(res, e) }
  })

  router.get('/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'id must be a positive integer' })
    try {
      res.json(svc.getKdl(db(req), id))
    } catch (e) { handleError(res, e) }
  })

  router.put('/:id', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'id must be a positive integer' })
    try {
      res.json(svc.updateKdl(db(req), id, req.body || {}))
    } catch (e) { handleError(res, e) }
  })

  router.delete('/:id', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'id must be a positive integer' })
    try {
      res.json(svc.deleteKdl(db(req), id))
    } catch (e) { handleError(res, e) }
  })

  router.get('/:id/members', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'id must be a positive integer' })
    try {
      res.json(svc.listKdlMembers(db(req), id))
    } catch (e) { handleError(res, e) }
  })

  router.post('/:id/members', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const id = parseId(req.params.id)
    const memberId = parseId(req.body?.memberId)
    if (!id || !memberId) return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'id and memberId must be positive integers' })
    try {
      res.status(201).json(svc.attachMember(db(req), id, memberId))
    } catch (e) { handleError(res, e) }
  })

  router.delete('/:id/members/:memberId', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const id = parseId(req.params.id)
    const memberId = parseId(req.params.memberId)
    if (!id || !memberId) return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'id and memberId must be positive integers' })
    try {
      res.json(svc.detachMember(db(req), id, memberId))
    } catch (e) { handleError(res, e) }
  })

  router.get('/:id/penugasan', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'id must be a positive integer' })
    try {
      res.json(svc.listPenugasanForKdl(db(req), id))
    } catch (e) { handleError(res, e) }
  })

  return router
}

export default createKdlRouter