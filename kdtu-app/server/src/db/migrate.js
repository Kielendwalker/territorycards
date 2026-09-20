// Runs schema.sql against an open better-sqlite3-multiple-ciphers connection.
// Safe to call multiple times: every statement is IF NOT EXISTS / OR IGNORE.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(__dirname, 'schema.sql')

export function applySchema(db) {
  const sql = readFileSync(SCHEMA_PATH, 'utf8')
  db.exec(sql)
  return db
}