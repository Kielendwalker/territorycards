// security middleware — helmet, CORS allow-list, JSON body, gzip, logging.
//
// Helmet is configured defensively:
// - default-src 'self': script/style/connect/img all locked to same-origin
//   (with explicit exceptions for the Vite dev ports so HMR works locally).
// - object-src 'none', base-uri 'self', form-action 'self': blocks plugin
//   abuse and clickjacking via forms pointing elsewhere.
// - frame-ancestors 'none': the API is never embedded in an iframe.
// - upgrade-insecure-requests: in production, ask browsers to prefer HTTPS.

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
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'http://localhost:5181', 'http://localhost:5182'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false, // API serves images to its own frontends; COEP would block that
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    hidePoweredBy: true,
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization'],
    maxAge: 86400,
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