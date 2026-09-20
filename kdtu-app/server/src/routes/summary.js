// /api/summary/* — read monthly/annual aggregation of publication
// distribution and CRUD on individual entries.
//
//   GET    /api/summary/kdtu?year=YYYY     — year aggregate + raw entries
//   GET    /api/summary/kdtu/:bulan        — entries for one YYYY-MM month
//   POST   /api/summary/kdtu               — create entry   (admin)
//   PUT    /api/summary/kdtu/:id           — update entry   (admin)
//   DELETE /api/summary/kdtu/:id           — delete entry   (admin)
//
// Reads require an authenticated member or admin; writes require admin.

import express from 'express'
import { z } from 'zod'
import { ERROR_CODES, ROLE, PUBLICATION_CATEGORY } from '@kdtu/shared'
import { authenticate, requireRole } from '../middleware/auth.js'
import {
  NotFoundError,
  ValidationError,
  listSummaryByYear,
  listSummaryByMonth,
  createEntry,
  getEntry,
  updateEntry,
  deleteEntry,
} from '../services/summaryService.js'

const VALID_CATEGORIES = Object.values(PUBLICATION_CATEGORY)

const idParam = z.object({
  id: z.coerce.number().int().positive(),
})

const bulanParam = z.object({
  bulan: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM'),
})

const yearQuery = z.object({
  year: z.coerce.number().int().min(1900).max(9999),
})

const baseEntry = {
  periodId: z.coerce.number().int().positive(),
  bulan: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM'),
  location: z.string().min(1).max(200),
  sesi: z.string().min(1).max(200),
  category: z.enum(VALID_CATEGORIES),
  title: z.string().min(1).max(200),
  quantity: z.coerce.number().int().nonnegative(),
}

const createBody = z.object(baseEntry)

const updateBody = z.object({
  periodId: baseEntry.periodId.optional(),
  bulan: baseEntry.bulan.optional(),
  location: baseEntry.location.optional(),
  sesi: baseEntry.sesi.optional(),
  category: baseEntry.category.optional(),
  title: baseEntry.title.optional(),
  quantity: baseEntry.quantity.optional(),
}).refine((obj) => Object.keys(obj).length > 0, { message: 'patch must not be empty' })

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
  throw err
}

export function createSummaryRouter () {
  const router = express.Router()

  router.get('/summary/kdtu', authenticate, (req, res) => {
    const parsed = yearQuery.safeParse(req.query)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      const out = listSummaryByYear(req.app.locals.db, parsed.data.year)
      res.json(out)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.get('/summary/kdtu/:bulan', authenticate, (req, res) => {
    const parsed = bulanParam.safeParse(req.params)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      const out = listSummaryByMonth(req.app.locals.db, parsed.data.bulan)
      res.json(out)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.post('/summary/kdtu', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      const created = createEntry(req.app.locals.db, parsed.data)
      res.status(201).json(created)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.put('/summary/kdtu/:id', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const idCheck = idParam.safeParse(req.params)
    if (!idCheck.success) return zodBadInput(res, idCheck.error)
    const bodyCheck = updateBody.safeParse(req.body)
    if (!bodyCheck.success) return zodBadInput(res, bodyCheck.error)
    const id = idCheck.data.id
    const patch = bodyCheck.data
    try {
      const updated = updateEntry(req.app.locals.db, id, patch)
      res.json(updated)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  router.delete('/summary/kdtu/:id', authenticate, requireRole(ROLE.ADMIN), (req, res) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      deleteEntry(req.app.locals.db, parsed.data.id)
      res.status(204).end()
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  // Expose /:id GET for completeness (member/admin).
  router.get('/summary/kdtu/id/:id', authenticate, (req, res) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    try {
      const out = getEntry(req.app.locals.db, parsed.data.id)
      res.json(out)
    } catch (err) {
      return mapServiceError(res, err)
    }
  })

  return router
}

export default createSummaryRouter
