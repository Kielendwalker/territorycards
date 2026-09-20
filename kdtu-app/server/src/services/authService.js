// authService — argon2id password/PIN hashing + JWT issuance + refresh rotation.

import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { hashToken, signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js'

// Argon2id is the OWASP-recommended mode for both passwords and short PINs.
// We deliberately keep parameters modest because PINs are 4 digits and
// computing time is bounded by user perception; for `password` the same
// defaults apply.
const ARGON_OPTS = { type: argon2.argon2id }

export async function hashSecret (plain) {
  return argon2.hash(plain, ARGON_OPTS)
}

export async function verifySecret (hash, plain) {
  if (!hash || !plain) return false
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}

// Issue an access + refresh token pair for a given user. Returns raw refresh
// (to send to caller) and refreshRecord (the row to persist with its hash).
export function issueTokens ({ id, name, role, mustChangePassword = false }) {
  const jti = cryptoRandom()
  // The mustChangePassword claim travels in the access JWT so middleware can
  // gate protected routes without an extra DB round-trip per request.
  const accessToken = signAccess({ sub: id, name, role, mcp: mustChangePassword ? 1 : 0 })
  const refreshToken = signRefresh({ sub: id, role, jti })
  return {
    accessToken,
    refreshToken,
    refreshRecord: {
      jti,
      userId: id,
      role,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  }
}

export function decodeRefresh (refreshToken) {
  try {
    return verifyRefresh(refreshToken)
  } catch {
    return null
  }
}

function cryptoRandom () {
  return randomUUID()
}
