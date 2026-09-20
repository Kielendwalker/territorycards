// Runs schema.sql + every migrations/*.sql against an open DB in lexicographic
// order. Safe to re-run: schema.sql is all IF NOT EXISTS / OR IGNORE, and the
// migration files use guard rails (CREATE ... IF NOT EXISTS, runtime checks).
//
// Migrations are idempotent at the SQL level where possible. For ADD COLUMN
// we wrap the statement in a try/catch so "duplicate column name" errors are
// swallowed on subsequent runs (SQLCipher does not support ADD COLUMN IF NOT
// EXISTS).
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(__dirname, 'schema.sql')
const MIGRATIONS_DIR = join(__dirname, 'migrations')

function execIgnoringDuplicate (db, sql) {
  try {
    db.exec(sql)
  } catch (err) {
    if (/duplicate column name|already exists/i.test(String(err.message))) return
    throw err
  }
}

export function applySchema (db) {
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'))
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort() // lexicographic == numeric since we zero-pad (003, 004, ...)
  for (const f of files) {
    execIgnoringDuplicate(db, readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  }
  return db
}