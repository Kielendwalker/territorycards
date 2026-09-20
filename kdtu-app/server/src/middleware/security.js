// security middleware — helmet, CORS allow-list, JSON body, gzip, logging.

import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import morgan from 'morgan'
import express from 'express'

const ALLOWED_ORIGINS = [
  'http://localhost:5181',
  'http://localhost:5182',
]

export function helmetMiddleware () {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'http://localhost:5181', 'http://localhost:5182'],
      },
    },
  })
}

export function corsMiddleware () {
  return cors({
    origin: (origin, cb) => {
      // Same-origin requests (no Origin header) are allowed.
      if (!origin) return cb(null, true)
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
      return cb(new Error('CORS: origin not allowed'))
    },
    credentials: true,
  })
}

export function compressionMiddleware () {
  return compression()
}

export function morganMiddleware () {
  return morgan('combined')
}

export function jsonMiddleware () {
  return express.json({ limit: '256kb' })
}
