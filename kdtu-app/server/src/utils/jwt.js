// JWT helpers — HS256, secret from KDTU_JWT_SECRET.
// Returns: { signAccess, signRefresh, verifyAccess, verifyRefresh, hashToken }
// Storage strategy: only the SHA-256 hash of refresh tokens is persisted, never
// the raw token. This protects refresh tokens that have been logged at the
// proxy layer or stolen from a backup.

import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const ACCESS_TTL = '15m'
const REFRESH_TTL = '7d'

function getSecret () {
  const s = process.env.KDTU_JWT_SECRET
  if (!s || s.length < 32) {
    throw new Error('KDTU_JWT_SECRET must be set and at least 32 characters')
  }
  return s
}

export function signAccess (payload) {
  return jwt.sign(payload, getSecret(), { algorithm: 'HS256', expiresIn: ACCESS_TTL })
}

export function signRefresh (payload) {
  // payload = { sub, role, jti }
  return jwt.sign(payload, getSecret(), { algorithm: 'HS256', expiresIn: REFRESH_TTL })
}

export function verifyAccess (token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] })
}

export function verifyRefresh (token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] })
}

// SHA-256 of a token — used so we never store plaintext refresh tokens.
export function hashToken (token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}
