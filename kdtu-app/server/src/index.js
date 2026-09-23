// Express bootstrap. The db handle is injected via createApp({ db }) so that
// tests can build the app with their own test DB before the real db module
// (owned by sub-agent F) ships.

import express from 'express'
import { helmetMiddleware, corsMiddleware, compressionMiddleware, morganMiddleware, jsonMiddleware } from './middleware/security.js'
import { generalRateLimit } from './middleware/rateLimit.js'
import { audit, errorHandler } from './middleware/audit.js'
import { createAuthRouter } from './routes/auth.js'
import { createSummaryRouter } from './routes/summary.js'
import { createKdlRouter } from './routes/kdl.js'
import { createPeriodsRouter } from './routes/periods.js'
import { createPenugasanRouter } from './routes/penugasan.js'
import { createPublicationsRouter } from './routes/publications.js'
import { createFilesRouter, scanKdtuDataDir } from './routes/files.js'

// Scan kdtu-data/ at boot and (re)sync the `files` table so the API can
// serve any spreadsheet/image dropped into that folder without code changes.
// Idempotent: rows are upserted by unique name.
export function seedFilesTable (db) {
  const rows = scanKdtuDataDir()
  const insert = db.prepare(
    `INSERT INTO files (name, kind, size_bytes, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       kind = excluded.kind,
       size_bytes = excluded.size_bytes,
       updated_at = excluded.updated_at`
  )
  const tx = db.transaction((rs) => { for (const r of rs) insert.run(r.name, r.kind, r.size_bytes, r.updated_at) })
  tx(rows)
  return rows.length
}

export function createApp ({ db = null } = {}) {
  const app = express()
  // Trust the loopback proxy in dev so req.ip resolves to the client IP for rate limits.
  app.set('trust proxy', 'loopback')

  // Disable the X-Powered-By header so attackers can't trivially fingerprint
  // the framework. Helmet also strips this, but we set it explicitly so the
  // behaviour does not depend on helmet's defaults.
  app.disable('x-powered-by')

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
  // /api/summary/* is owned by routes/summary.js which uses full sub-paths,
  // so we mount it at /api and let it dispatch on /summary/kdtu/* internally.
  app.use('/api', createSummaryRouter())
  // KDL (Kecil Daftar Layanan), penugasan, and publications are mounted on
  // their own prefixes so the route files can use bare paths.
  app.use('/api/timetable/periods', createPeriodsRouter())
  app.use('/api/kdl', createKdlRouter())
  app.use('/api/penugasan', createPenugasanRouter())
  app.use('/api', createPublicationsRouter())
  // /api/files is admin-only + must-change-password-gated inside the router.
  app.use('/api/files', createFilesRouter())

  app.get('/healthz', (_req, res) => res.json({ ok: true }))

  // Catch-all 404 for unknown /api/* routes. Returns a JSON envelope rather
  // than the default Express HTML body, so the frontends can render the
  // message consistently.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'No such endpoint' }))

  app.use(errorHandler)
  return app
}

// CLI entrypoint: respects KDTU_DB_PATH. Lazy-import the db module owned by
// sub-agent F so the test path never accidentally loads the production one.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3001)
  const { openDb } = await import('./db/index.js')
  const db = openDb()
  // Sync the kdtu-data/ index into the files table at every boot so operators
  // don't have to run a separate CLI to add new assets.
  const count = seedFilesTable(db)
  const app = createApp({ db })
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[kdtu] listening on http://localhost:${port}`)
    // eslint-disable-next-line no-console
    console.log(`[kdtu] indexed ${count} file(s) from kdtu-data/`)
  })
}
