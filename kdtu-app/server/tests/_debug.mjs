process.env.KDTU_DB_KEY = 'test-db-key-must-be-at-least-32-characters-long-AA'
process.env.KDTU_FIELD_KEY = 'test-field-key-must-be-at-least-32-characters-long-BB'
process.env.KDTU_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long-CCCC'
process.env.NODE_ENV = 'test'
process.env.KDTU_DB_FILE = '/tmp/debug-summary.db'

import Database from 'better-sqlite3-multiple-ciphers'
import { rmSync } from 'node:fs'
try { rmSync(process.env.KDTU_DB_FILE, { force: true }) } catch {}
const db = new Database(process.env.KDTU_DB_FILE)
db.pragma("cipher='sqlcipher'")
db.pragma(`key="${process.env.KDTU_DB_KEY}"`)
db.pragma('foreign_keys = ON')

const { applySchema } = await import('../src/db/migrate.js')
applySchema(db)

db.prepare("INSERT INTO timetable_periods (id, label, starts_on, ends_on) VALUES (1, 'Sep 2026', '2026-09-01', '2026-09-30')").run()
const id = db.prepare("INSERT INTO kdtu_summary_entries (period_id, bulan, location, sesi, category, title, quantity) VALUES (1, '2026-09', 'L', 'S', 'Buku', 'Original', 3)").run().lastInsertRowid

const { updateEntry, getEntry } = await import('../src/services/summaryService.js')
try {
  const updated = updateEntry(db, Number(id), { quantity: 10 })
  console.log('UPDATED:', updated)
} catch (e) {
  console.log('ERROR:', e.name, e.code, e.message)
  console.log('STACK:', e.stack)
}
