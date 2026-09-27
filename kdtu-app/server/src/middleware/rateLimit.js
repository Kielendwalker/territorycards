// rate limit factories using express-rate-limit.
//
// Default: 100 req / 15 min for general traffic, 5 / 15 min for /api/auth/*.
// Tests can override `max` via env (KDTU_TEST_RATE_LIMIT_MAX) so that a single
// scenario can exercise login + refresh + me + rotate + me without tripping
// the 5-request cap. Production ignores the env var.

import rateLimit from 'express-rate-limit'
import { ERROR_CODES } from '@kdtu/shared'

const FIFTEEN_MIN = 15 * 60 * 1000

function effectiveMax (fallback) {
  // Tests opt into a higher ceiling via KDTU_TEST_RATE_LIMIT_MAX; production
  // always uses the fallback. Read on every call so test setup that toggles
  // the env between builds gets the right value.
  if (process.env.NODE_ENV !== 'test') return fallback
  const v = Number(process.env.KDTU_TEST_RATE_LIMIT_MAX)
  return Number.isFinite(v) && v > 0 ? v : fallback
}

// Common error-shape so clients can react to RATE_LIMITED.
function rateLimitHandler (_req, res /* , next, options */) {
  res.status(429).json({ error: ERROR_CODES.RATE_LIMITED, message: 'Too many requests' })
}

export function authRateLimit () {
  return rateLimit({
    windowMs: FIFTEEN_MIN,
    max: effectiveMax(5),
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  })
}

export function generalRateLimit () {
  return rateLimit({
    windowMs: FIFTEEN_MIN,
    max: effectiveMax(100),
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  })
}