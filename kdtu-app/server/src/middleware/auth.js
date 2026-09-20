// auth middleware — JWT verification + role gates.
// Verifies the access token (Authorization: Bearer ...) or the
// `kdtu_session` cookie. Attaches `req.user = { id, name, role }` on success.

import { verifyAccess } from '../utils/jwt.js'
import { ERROR_CODES } from '@kdtu/shared'

export function authenticate (req, res, next) {
  const headerToken = extractBearer(req.headers.authorization)
  const cookieToken = req.cookies?.kdtu_session || null
  const token = headerToken || cookieToken
  if (!token) {
    return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Missing token' })
  }
  try {
    const payload = verifyAccess(token)
    req.user = { id: payload.sub, name: payload.name, role: payload.role }
    return next()
  } catch {
    return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Invalid or expired token' })
  }
}

export function requireRole (...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Unauthenticated' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: ERROR_CODES.FORBIDDEN, message: 'Insufficient role' })
    }
    return next()
  }
}

function extractBearer (header) {
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (scheme !== 'Bearer' || !value) return null
  return value
}
