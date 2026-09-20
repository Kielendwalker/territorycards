// rate limit factories using express-rate-limit.
// Different limits for auth endpoints vs. everything else.

import rateLimit from 'express-rate-limit'
import { ERROR_CODES } from '@kdtu/shared'

const FIFTEEN_MIN = 15 * 60 * 1000

// Common error-shape so clients can react to RATE_LIMITED.
function rateLimitHandler (_req, res /* , next, options */) {
  res.status(429).json({ error: ERROR_CODES.RATE_LIMITED, message: 'Too many requests' })
}

export function authRateLimit () {
  return rateLimit({
    windowMs: FIFTEEN_MIN,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  })
}

export function generalRateLimit () {
  return rateLimit({
    windowMs: FIFTEEN_MIN,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  })
}
