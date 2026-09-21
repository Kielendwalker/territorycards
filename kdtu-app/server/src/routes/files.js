// /api/files — admin-only download + preview of xlsx + image assets under kdtu-data/.
//
// Hardening:
// - Files are looked up by an opaque integer id from the files table; the
//   filesystem path is never returned to the client.
// - All routes require the admin role and that the seeded password has been
//   rotated; members and unauthenticated callers get 401/403.
// - File paths are resolved with realpathSync() and checked to live under
//   the kdtu-data/ dir. Symlinks pointing outside the dir are rejected.
// - Each download emits an audit_log row with the actor, file id, outcome.
// - Content-Disposition is set so browsers prompt "Save as" for download and
//   render inline for preview.
//
// The `files` table is seeded on boot by scanning the directory (see
// src/index.js -> seedFilesTable).

import express from 'express'
import path from 'node:path'
import { existsSync, statSync, realpathSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { authenticate, requireRole, requirePasswordChanged } from '../middleware/auth.js'
import { ROLE } from '@kdtu/shared'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Resolved lazily so the module can be loaded in environments where kdtu-data
  // does not yet exist (tests, CI before asset sync). The first .scan() /
  // .resolve() call will surface a clean ENOENT error.
  let _kdtuDataDir = null
  function kdtuDataDir () {
    if (_kdtuDataDir) return _kdtuDataDir
    // This file lives at kdtu-app/server/src/routes/files.js, so four `..`s
    // climb back to the workspace root where kdtu-data/ lives.
    const candidate = join(__dirname, '..', '..', '..', '..', 'kdtu-data')
    _kdtuDataDir = realpathSync(candidate)
    return _kdtuDataDir
  }

// Conservative mime map; everything else falls back to application/octet-stream
// so the browser always offers "Save as".
const MIME = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls':  'application/vnd.ms-excel',
  '.pdf':  'application/pdf',
  '.csv':  'text/csv',
  '.txt':  'text/plain; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
}
function mimeFor (filename) {
  const ext = path.extname(filename).toLowerCase()
  return MIME[ext] || 'application/octet-stream'
}

// Returns the canonical, realpath-resolved path for a stored file or null if
// the stored name cannot be safely resolved under the data dir. This is the
// only path the rest of the handler trusts.
function safeResolve (filename) {
  if (!filename || filename.includes('\0')) return null
  if (filename.includes('..') || filename.startsWith('/') || filename.startsWith('\\')) return null
  let dataDir
  try { dataDir = kdtuDataDir() } catch { return null }
  const candidate = join(dataDir, filename)
  let resolved
  try { resolved = realpathSync(candidate) } catch { return null }
  // Ensure the resolved path is still under the data dir (defends against
  // symlinks pointing outside the data dir).
  if (!resolved.startsWith(dataDir + path.sep) && resolved !== dataDir) return null
  return resolved
}

export function createFilesRouter () {
  const router = express.Router()

  // Every /api/files/* call is admin-only and must have rotated the seeded
  // password. We mount `requirePasswordChanged` after `authenticate` so a
  // brand-new admin can't bulk-download files before rotating the credential.
  router.use(authenticate, requireRole(ROLE.ADMIN), requirePasswordChanged)

  // GET /api/files — list of downloadable files (no filesystem paths).
  router.get('/', (req, res) => {
    const db = req.app.locals.db
    const rows = db.prepare(
      'SELECT id, name, kind, size_bytes, updated_at FROM files ORDER BY kind, name'
    ).all()
    res.json({ files: rows })
  })

  // GET /api/files/:id/download — attachment-style download.
  router.get('/:id/download', (req, res) => {
    const db = req.app.locals.db
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'VALIDATION', message: 'Invalid id' })
    const row = db.prepare('SELECT name, kind, size_bytes FROM files WHERE id = ?').get(id)
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'File not found' })
    const resolved = safeResolve(row.name)
    if (!resolved) return res.status(404).json({ error: 'NOT_FOUND', message: 'File not available' })
    if (!existsSync(resolved)) return res.status(404).json({ error: 'NOT_FOUND', message: 'File missing on disk' })
    // RFC 5987 filename* so non-ASCII characters survive the Save-as dialog.
    const asciiName = row.name.replace(/[^\x20-\x7E]/g, '_')
    const starName = encodeURIComponent(row.name)
    res.setHeader('Content-Type', mimeFor(row.name))
    res.setHeader('Content-Length', String(statSync(resolved).size))
    res.setHeader('Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${starName}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, max-age=0, no-store')
    logAudit(db, req, row, 'download', 200)
    res.sendFile(resolved)
  })

  // GET /api/files/:id/preview — inline preview (used for HD images).
  router.get('/:id/preview', (req, res) => {
    const db = req.app.locals.db
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'VALIDATION', message: 'Invalid id' })
    const row = db.prepare('SELECT name, kind, size_bytes FROM files WHERE id = ?').get(id)
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'File not found' })
    if (row.kind !== 'image') {
      return res.status(400).json({ error: 'VALIDATION', message: 'Only images can be previewed inline' })
    }
    const resolved = safeResolve(row.name)
    if (!resolved || !existsSync(resolved)) return res.status(404).json({ error: 'NOT_FOUND', message: 'File missing on disk' })
    res.setHeader('Content-Type', mimeFor(row.name))
    res.setHeader('Content-Length', String(statSync(resolved).size))
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    logAudit(db, req, row, 'preview', 200)
    res.sendFile(resolved)
  })

  return router
}

function logAudit (db, req, row, kind, status) {
  // Best-effort: an audit-log failure must not break the download. We log to
  // the same audit_log table that audit.js uses; audit.js itself only logs
  // mutating methods, so file GETs would otherwise be invisible.
  try {
    const actor = req.user?.name || 'unknown'
    const details = JSON.stringify({
      ip: req.ip,
      ua: req.get('user-agent') || null,
      file: row.name,
      size: row.size_bytes,
      kind,
      status,
    })
    db.prepare(
      'INSERT INTO audit_log (actor, action, resource, details, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(actor, `${req.method} ${req.originalUrl}`, 'files', details, new Date().toISOString())
  } catch (err) {
    console.error('[audit-files] failed:', err.message)
  }
}

// Re-read the directory at boot. Returns the rows that should be inserted
// into the `files` table (id assigned by autoincrement). This runs once when
// the API process boots; the rows are stable until restart.
export function scanKdtuDataDir () {
  const EXT_KIND = new Map([
    ['.xlsx', 'spreadsheet'], ['.xls', 'spreadsheet'], ['.csv', 'spreadsheet'],
    ['.png', 'image'], ['.jpg', 'image'], ['.jpeg', 'image'], ['.webp', 'image'], ['.gif', 'image'],
    ['.pdf', 'document'], ['.txt', 'document'],
  ])
  // Walk the directory non-recursively. We deliberately do NOT recurse into
  // subdirectories so an operator adding a folder of unrelated files can't
  // accidentally expose them via the download endpoint.
  const rows = []
  let dataDir
  try { dataDir = kdtuDataDir() } catch { return rows }
  let entries
  try { entries = readdirSync(dataDir) } catch { return rows }
  for (const name of entries) {
    const ext = path.extname(name).toLowerCase()
    const kind = EXT_KIND.get(ext)
    if (!kind) continue
    if (name.startsWith('.')) continue // skip dotfiles
    const full = join(dataDir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (!st.isFile()) continue
    rows.push({
      name,
      kind,
      size_bytes: st.size,
      updated_at: st.mtime.toISOString(),
    })
  }
  return rows
}

export { kdtuDataDir }
