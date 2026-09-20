// /api/auth/* — login (admin or member-PIN), refresh rotation, logout, me, change-password.
//
// Exported as `createAuthRouter()` (not a singleton) so that each Express app
// built by `createApp({ db })` gets its own rate-limit bucket. This matters for
// test isolation: two apps in the same process must not share counters.
//
// Schema reference: server/src/db/schema.sql
//   admins(username TEXT UNIQUE, password_hash TEXT, must_change_password INT)
//   members(name_enc BLOB, pin_hash TEXT, active INT)
//   refresh_tokens(jti PK, user_id, role, token_hash UNIQUE, ...)
//
// Member names are AES-encrypted at rest (see utils/crypto.js). To look up a
// member by `memberName`, we scan-and-decrypt; a future iteration should add a
// lookup table keyed by HMAC of the name.
//
// First-login hardening: an admin row with must_change_password=1 receives
// tokens whose access JWT carries mcp=1. requirePasswordChanged() middleware
// (in middleware/auth.js) blocks every protected route with
// 403 PASSWORD_RESET_REQUIRED until POST /change-password clears the flag.

import express from 'express'
import { z } from 'zod'
import { ERROR_CODES, PASSWORD_MIN_LENGTH, PIN_LENGTH, ROLE } from '@kdtu/shared'
import { issueTokens, decodeRefresh, verifySecret, hashSecret } from '../services/authService.js'
import { hashToken } from '../utils/jwt.js'
import { decryptField, deriveKey } from '../utils/crypto.js'
import { authenticate, requireRole, requirePasswordChanged } from '../middleware/auth.js'
import { authRateLimit } from '../middleware/rateLimit.js'

function fieldKey () {
  const k = process.env.KDTU_FIELD_KEY
  if (!k || k.length < 32) {
    throw new Error('KDTU_FIELD_KEY must be set and >= 32 chars to read encrypted fields')
  }
  return deriveKey(k)
}

function findMemberByName (db, plainName) {
  const rows = db.prepare('SELECT id, name_enc, pin_hash, active FROM members WHERE active = 1').all()
  for (const r of rows) {
    let decrypted
    try {
      decrypted = decryptField(r.name_enc, fieldKey())
    } catch {
      continue
    }
    if (decrypted === plainName) return r
  }
  return null
}

function memberNameForUserId (db, userId) {
  const row = db.prepare('SELECT name_enc FROM members WHERE id = ?').get(userId)
  if (!row) return 'unknown'
  try {
    return decryptField(row.name_enc, fieldKey())
  } catch {
    return 'unknown'
  }
}

export function createAuthRouter () {
  const router = express.Router()
  router.use(authRateLimit())

  const loginSchema = z.object({
    username: z.string().min(1, 'username required'),
    password: z.string().min(1, 'password required'),
  })

  const pinLoginSchema = z.object({
    memberName: z.string().min(1, 'memberName required'),
    pin: z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), `pin must be ${PIN_LENGTH} digits`),
  })

  const refreshSchema = z.object({
    refreshToken: z.string().min(1, 'refreshToken required'),
  })

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'currentPassword required'),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, `newPassword must be >= ${PASSWORD_MIN_LENGTH} chars`),
  })

  function zodBadInput (res, error) {
    const fields = {}
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_'
      fields[key] = issue.message
    }
    return res.status(400).json({ error: ERROR_CODES.VALIDATION, message: 'Invalid input', fields })
  }

  function setSessionCookie (res, accessToken) {
    res.cookie('kdtu_session', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    })
  }

  function issueAndPersist (db, user) {
    const tokens = issueTokens(user)
    db.prepare(
      'INSERT INTO refresh_tokens (jti, user_id, role, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)'
    ).run(tokens.refreshRecord.jti, tokens.refreshRecord.userId, tokens.refreshRecord.role, tokens.refreshRecord.tokenHash, tokens.refreshRecord.expiresAt)
    return tokens
  }

  // POST /login — admin username + password.
  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    const { username, password } = parsed.data
    const db = req.app.locals.db
    const row = db.prepare(
      "SELECT id, username, display_name, password_hash, must_change_password FROM admins WHERE username = ?"
    ).get(username)
    if (!row || !(await verifySecret(row.password_hash, password))) {
      return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Invalid credentials' })
    }
    const mustChange = row.must_change_password === 1
    const tokens = issueAndPersist(db, {
      id: row.id,
      name: row.display_name || row.username,
      role: ROLE.ADMIN,
      mustChangePassword: mustChange,
    })
    setSessionCookie(res, tokens.accessToken)
    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role: ROLE.ADMIN,
      user: { id: row.id, name: row.display_name || row.username },
      mustChangePassword: mustChange,
    })
  })

  // POST /pin-login — member name + 4-digit PIN.
  router.post('/pin-login', async (req, res) => {
    const parsed = pinLoginSchema.safeParse(req.body)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    const { memberName, pin } = parsed.data
    const db = req.app.locals.db
    const row = findMemberByName(db, memberName)
    if (!row || !(await verifySecret(row.pin_hash, pin))) {
      return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Invalid credentials' })
    }
    const tokens = issueAndPersist(db, { id: row.id, name: memberName, role: ROLE.MEMBER })
    setSessionCookie(res, tokens.accessToken)
    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role: ROLE.MEMBER,
      user: { id: row.id, name: memberName },
    })
  })

  // POST /refresh — rotate a refresh token. Replay = 401 + family kill.
  router.post('/refresh', (req, res) => {
    const parsed = refreshSchema.safeParse(req.body)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    const { refreshToken } = parsed.data
    const payload = decodeRefresh(refreshToken)
    if (!payload || !payload.jti) {
      return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Invalid refresh token' })
    }
    const db = req.app.locals.db
    const tokenHash = hashToken(refreshToken)
    const row = db.prepare('SELECT jti, user_id, role, revoked_at FROM refresh_tokens WHERE token_hash = ?').get(tokenHash)
    if (!row) {
      return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Unknown refresh token' })
    }
    if (row.revoked_at) {
      db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(new Date().toISOString(), row.user_id)
      return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Refresh token reuse detected' })
    }
    const name = row.role === ROLE.ADMIN
      ? (db.prepare('SELECT display_name, username FROM admins WHERE id = ?').get(row.user_id)?.display_name || 'admin')
      : memberNameForUserId(db, row.user_id)
    // Re-read must_change_password on every refresh so a password rotation
    // in another tab/session takes effect without forcing a re-login.
    let mustChangePassword = false
    if (row.role === ROLE.ADMIN) {
      mustChangePassword = db.prepare(
        'SELECT must_change_password FROM admins WHERE id = ?'
      ).get(row.user_id)?.must_change_password === 1
    }
    const tokens = issueAndPersist(db, {
      id: row.user_id, name, role: row.role, mustChangePassword,
    })
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE jti = ?').run(new Date().toISOString(), row.jti)
    setSessionCookie(res, tokens.accessToken)
    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      mustChangePassword,
    })
  })

  // POST /logout — revoke a refresh token (no-op if unknown).
  router.post('/logout', (req, res) => {
    const parsed = refreshSchema.safeParse(req.body)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    const { refreshToken } = parsed.data
    const db = req.app.locals.db
    const tokenHash = hashToken(refreshToken)
    db.prepare('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?')
      .run(new Date().toISOString(), tokenHash)
    res.clearCookie('kdtu_session', { path: '/' })
    res.json({ ok: true })
  })

  // GET /me — current user from access token. Gated by requirePasswordChanged
  // so a fresh admin must rotate before reading their own profile data.
  router.get('/me', authenticate, requirePasswordChanged, (req, res) => {
    res.json({
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      mustChangePassword: req.user.mustChangePassword === true,
    })
  })

  // POST /change-password — admin only, min PASSWORD_MIN_LENGTH chars for the
  // new password. NOT gated by requirePasswordChanged because rotating the
  // credential is exactly what an unrotated admin needs to do.
  router.post('/change-password', authenticate, requireRole(ROLE.ADMIN), async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body)
    if (!parsed.success) return zodBadInput(res, parsed.error)
    const { currentPassword, newPassword } = parsed.data
    const db = req.app.locals.db
    const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.user.id)
    if (!row || !(await verifySecret(row.password_hash, currentPassword))) {
      return res.status(401).json({ error: ERROR_CODES.UNAUTHORIZED, message: 'Current password incorrect' })
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({
        error: ERROR_CODES.VALIDATION,
        message: 'New password must differ from the current one',
      })
    }
    const newHash = await hashSecret(newPassword)
    // Clear must_change_password so subsequent requests pass the gate.
    db.prepare(
      'UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?'
    ).run(newHash, req.user.id)
    res.json({ ok: true, mustChangePassword: false })
  })

  return router
}

export default createAuthRouter