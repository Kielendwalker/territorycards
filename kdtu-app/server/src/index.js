// Express bootstrap. The db handle is injected via createApp({ db }) so that
// tests can build the app with their own test DB before the real db module
// (owned by sub-agent F) ships.

import express from 'express'
import { helmetMiddleware, corsMiddleware, compressionMiddleware, morganMiddleware, jsonMiddleware } from './middleware/security.js'
import { generalRateLimit } from './middleware/rateLimit.js'
import { audit, errorHandler } from './middleware/audit.js'
import { createAuthRouter } from './routes/auth.js'

export function createApp ({ db = null } = {}) {
  const app = express()
  // Trust the loopback proxy in dev so req.ip resolves to the client IP for rate limits.
  app.set('trust proxy', 'loopback')

  app.use(helmetMiddleware())
  app.use(corsMiddleware())
  app.use(compressionMiddleware())
  app.use(morganMiddleware())
  app.use(jsonMiddleware())
  app.use(generalRateLimit())

  // Attach the DB handle so routes can reach it via req.app.locals.db.
  app.locals.db = db

  // Audit must come AFTER body parsing (so req.body is populated) and AFTER
  // auth middleware so req.user reflects the verified caller. The audit
  // middleware simply skips safe methods, so it is cheap to mount globally.
  app.use(audit(db))

  app.use('/api/auth', createAuthRouter())

  app.get('/healthz', (_req, res) => res.json({ ok: true }))

  app.use(errorHandler)
  return app
}

// CLI entrypoint: respects KDTU_DB_PATH. Lazy-import the db module owned by
// sub-agent F so the test path never accidentally loads the production one.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3001)
  const { openDb } = await import('./db/index.js')
  const db = openDb()
  const app = createApp({ db })
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[kdtu] listening on http://localhost:${port}`)
  })
}
