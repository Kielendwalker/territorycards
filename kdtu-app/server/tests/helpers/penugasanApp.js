// Test helper: build an Express app backed by a real SQLCipher tmpfile DB.
// Mirrors db.test.js's openDb() pattern so the penugasan module runs against
// the production schema (kdl, penugasan, etc.) rather than the in-memory JS
// mock used by the auth tests.
//
// The returned `app` exposes:
//   app.locals.db  — better-sqlite3-multiple-ciphers handle
//
// Seeds an admin user so /api/auth/login can be exercised; routes are mounted
// via mountRoutes(app) below.

import argon2 from 'argon2'
import express from 'express'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../src/index.js'
import { createAuthRouter } from '../../src/routes/auth.js'
import { createPenugasanRouter } from '../../src/routes/penugasan.js'
import { openDb, closeDb } from '../../src/db/index.js'

const TEST_DB_KEY    = 'test-db-key-must-be-at-least-32-characters-long-AA'
const TEST_FIELD_KEY = 'test-field-key-must-be-at-least-32-characters-long-BB'
const TEST_JWT       = 'test-jwt-secret-must-be-at-least-32-chars-long-CCCC'

process.env.KDTU_DB_KEY    = TEST_DB_KEY
process.env.KDTU_FIELD_KEY = TEST_FIELD_KEY
process.env.KDTU_JWT_SECRET = TEST_JWT
process.env.NODE_ENV = 'test'

export async function buildPenugasanTestApp ({ admin } = {}) {
  const creds = admin || { username: 'admin', password: 'correct-horse-battery-staple', display_name: 'Admin' }

  // Create a tmpfile for the encrypted DB.
  const dir = mkdtempSync(join(tmpdir(), 'kdtu-penugasan-'))
  const tmpFile = join(dir, 'kdtu.db')
  writeFileSync(tmpFile, '')

  // openDb() is a singleton — if another test already opened one, we must
  // close it before re-opening with our tmpfile. Also wipes _db so openDb
  // uses our file rather than the cached one.
  closeDb()
  // openDb reads KDTU_DB_FILE; ensure it points at our tmpfile.
  process.env.KDTU_DB_FILE = tmpFile
  const db = openDb({ dbKey: TEST_DB_KEY })

  // Seed an admin row so /api/auth/login works.
  const adminHash = await argon2.hash(creds.password, { type: argon2.argon2id })
  db.prepare(
    'INSERT OR IGNORE INTO admins (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)'
  ).run(1, creds.username, adminHash, creds.display_name)

  // Seed KDL rows 1 and 2 so tests that create penugasan for kdlId=2 do not
  // hit "KDL not found". Idempotent on re-runs.
  db.prepare(
    "INSERT OR IGNORE INTO kdl (id, name, leader, meeting_day) VALUES (1, 'KDL 1 — Srengseng', NULL, NULL)"
  ).run()
  db.prepare(
    "INSERT OR IGNORE INTO kdl (id, name, leader, meeting_day) VALUES (2, 'KDL 2 — Test', NULL, NULL)"
  ).run()

  // Build the same Express app as production, then mount the penugasan router.
  const app = createApp({ db })
  app.use('/api/auth', createAuthRouter())
  app.use('/api/penugasan', createPenugasanRouter())

  return { app, db, credentials: { admin: creds }, tmpFile, tmpDir: dir }
}
