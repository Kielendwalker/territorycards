// audit middleware — for every mutating request, append a row to audit_log.
// Best-effort write; failures are logged but never block the response.

import { ERROR_CODES } from '@kdtu/shared'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function audit (db) {
  return function auditMiddleware (req, res, next) {
    if (!MUTATING.has(req.method)) return next()
    // Capture response status to record outcome.
    res.on('finish', () => {
      try {
        const actor = req.user?.name || 'anonymous'
        const action = `${req.method} ${req.originalUrl}`
        const resource = (req.originalUrl.split('/').filter(Boolean)[0] || '').toString()
        const details = JSON.stringify({
          ip: req.ip,
          ua: req.get('user-agent') || null,
          status: res.statusCode,
          body: sanitize(req.body),
        })
        db.prepare(
          'INSERT INTO audit_log (actor, action, resource, details, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(actor, action, resource, details, new Date().toISOString())
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[audit] failed:', err.message)
      }
    })
    return next()
  }
}

// Strip obvious sensitive fields before persisting body to the audit log.
function sanitize (body) {
  if (!body || typeof body !== 'object') return body || null
  const clone = { ...body }
  for (const k of ['password', 'currentPassword', 'newPassword', 'pin', 'refreshToken']) {
    if (k in clone) clone[k] = '***'
  }
  return clone
}

// Centralized error handler. Always returns { error, message, fields? }.
export function errorHandler (err, _req, res, _next) {
  if (res.headersSent) return
  if (err && err.message === 'CORS: origin not allowed') {
    return res.status(403).json({ error: ERROR_CODES.FORBIDDEN, message: 'Origin not allowed' })
  }
  // eslint-disable-next-line no-console
  console.error('[server] unhandled:', err)
  res.status(500).json({ error: ERROR_CODES.SERVER, message: 'Internal server error' })
}
