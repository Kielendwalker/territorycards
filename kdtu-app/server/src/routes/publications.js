// /api/publications/* and /api/timetable/periods/:periodId/publications/* —
// CRUD for the publication catalogue and the timetable join.
//
// Mounts under two base paths:
//   /api/publications                       -> catalog CRUD
//   /api/timetable/periods/:periodId/publications -> per-period join rows
//
// Auth: catalog reads are public; writes require an admin (requireRole admin).
//       join-row reads are public; writes require admin.
//
// Schema reference: server/src/db/schema.sql (publications, timetable_publications)

import express from 'express'
import { z } from 'zod'
import { ERROR_CODES, ROLE, PUBLICATION_CATEGORY } from '@kdtu/shared'
import { authenticate, requireRole } from '../middleware/auth.js'
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  listPublications,
  getPublication,
  createPublication,
  updatePublication,
  deletePublication,
  listPeriodPublications,
  attachPeriodPublication,
  updatePeriodPublication,
  detachPeriodPublication,
} from '../services/publicationsService.js'

const VALID_CATEGORIES = new Set(Object.values(PUBLICATION_CATEGORY))

const idParam = z.object({
  id: z.coerce.number().int().positive(),
})

const periodIdParam = z.object({
  periodId: z.coerce.number().int().positive(),
})

const periodAndPubIdParam = z.object({
  periodId: z.coerce.number().int().positive(),
  publicationId: z.coerce.number().int().positive(),
})

const createBody = z.object({
  category: z.enum(Object.values(PUBLICATION_CATEGORY)),
  title: z.string().min(1).max(200),
  edition: z.union([z.string().min(1).max(200), z.null()]).optional(),
  stock: z.number().int().nonnegative().optional(),
})

const updateBody = z.object({
  category: z.enum(Object.values(PUBLICATION_CATEGORY)).optional(),
  title: z.string().min(1).max(200).optional(),
  edition: z.union([z.string().min(1).max(200), z.null()]).optional(),
  stock: z.number().int().nonnegative().optional(),
})

const quantityBody = z.object({
  quantity: z.number().int().nonnegative(),
})

function zodBadInput (res, error) {
  const fields = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] = issue.message
  }
  return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'Invalid input', fields })
}

function mapServiceError (res, err) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: err.message, fields: err.fields || {} })
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: ERROR_CODES.NOT_FOUND, message: err.message })
  }
  if (err instanceof ConflictError) {
    return res.status(409).json({ error: ERROR_CODES.CONFLICT, message: err.message })
  }
  // Unknown — let the global error handler take it.
  throw err
}

export function createPublicationsRouter () {
  const router = express.Router()

  // ---- /api/publications -----------------------------------------------

  router.get('/publications', (req, res) => {
    try {
      const items = listPublications(req.app.locals.db, {
        category: req.query.category,
        q: req.query.q,
      })
      res.json(items)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.post('/publications', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      const created = createPublication(req.app.locals.db, parsed.data)
      res.status(201).json(created)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.get('/publications/:id', (req, res) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      const item = getPublication(req.app.locals.db, parsed.data.id)
      res.json(item)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.put('/publications/:id', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const idParsed = idParam.safeParse(req.params)
    if (!idParsed.success) return zodBadInput(res, idParsed.error)
    const bodyParsed = updateBody.safeParse(req.body)
    if (!bodyParsed.success) return zodBadInput(res, bodyParsed.error)
    const patch = bodyParsed.data
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        error: ERROR_CODES.VALIDATION,
        message: 'Invalid input',
        fields: { _: 'patch must not be empty' },
      })
    }
    const id = idParsed.data.id
    try {
      const updated = updatePublication(req.app.locals.db, id, patch)
      res.json(updated)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.delete('/publications/:id', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      deletePublication(req.app.locals.db, parsed.data.id)
      res.status(204).end()
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  // ---- /api/timetable/periods/:periodId/publications -------------------

  router.get('/timetable/periods/:periodId/publications', (req, res) => {
    const parsed = periodIdParam.safeParse(req.params)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      const rows = listPeriodPublications(req.app.locals.db, parsed.data.periodId)
      res.json(rows)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.post('/timetable/periods/:periodId/publications', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const pathParsed = periodIdParam.safeParse(req.params)
    if (!pathParsed.success) return zodBadInput(res, pathParsed.error)
    const bodyParsed = quantityBody.extend({ publicationId: z.coerce.number().int().positive() }).safeParse(req.body)
    if (!bodyParsed.success) return zodBadInput(res, bodyParsed.error)
    try {
      const out = attachPeriodPublication(
        req.app.locals.db,
        pathParsed.data.periodId,
        bodyParsed.data.publicationId,
        bodyParsed.data.quantity,
      )
      res.status(201).json(out)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.put('/timetable/periods/:periodId/publications/:publicationId', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const pathParsed = periodAndPubIdParam.safeParse(req.params)
    if (!pathParsed.success) return zodBadInput(res, pathParsed.error)
    const bodyParsed = quantityBody.safeParse(req.body)
    if (!bodyParsed.success) return zodBadInput(res, bodyParsed.error)
    try {
      const out = updatePeriodPublication(
        req.app.locals.db,
        pathParsed.data.periodId,
        pathParsed.data.publicationId,
        bodyParsed.data.quantity,
      )
      res.json(out)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.delete('/timetable/periods/:periodId/publications/:publicationId', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const pathParsed = periodAndPubIdParam.safeParse(req.params)
    if (!pathParsed.success) return zodBadInput(res, pathParsed.error)
    try {
      detachPeriodPublication(
        req.app.locals.db,
        pathParsed.data.periodId,
        pathParsed.data.publicationId,
      )
      res.status(204).end()
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  return router
}

export default createPublicationsRouter
