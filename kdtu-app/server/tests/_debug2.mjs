process.env.KDTU_DB_KEY = 'test-db-key-must-be-at-least-32-characters-long-AA'
process.env.KDTU_FIELD_KEY = 'test-field-key-must-be-at-least-32-characters-long-BB'
process.env.KDTU_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long-CCCC'
process.env.NODE_ENV = 'test'
process.env.KDTU_DB_FILE = '/tmp/debug-summary2.db'

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

import argon2 from 'argon2'
import express from 'express'
import request from 'supertest'
import { createSummaryRouter } from '../src/routes/summary.js'
import { helmetMiddleware, corsMiddleware, compressionMiddleware, morganMiddleware, jsonMiddleware } from '../src/middleware/security.js'
import { generalRateLimit } from '../src/middleware/rateLimit.js'
import { authenticate } from '../src/middleware/auth.js'
import { audit, errorHandler } from '../src/middleware/audit.js'
import { createAuthRouter } from '../src/routes/auth.js'

const adminHash = await argon2.hash('correct-horse-battery-staple', { type: argon2.argon2id })
db.prepare("INSERT INTO admins (id, username, password_hash, display_name) VALUES (1, 'admin', ?, 'Admin')").run(adminHash)

const app = express()
app.set('trust proxy', 'loopback')
app.use(helmetMiddleware())
app.use(corsMiddleware())
app.use(compressionMiddleware())
app.use(morganMiddleware())
app.use(jsonMiddleware())
app.use(generalRateLimit())
app.locals.db = db
app.use(audit(db))
app.use('/api/auth', createAuthRouter())
app.use('/api', createSummaryRouter())
app.use(errorHandler)

const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'correct-horse-battery-staple' })
console.log('LOGIN:', login.status, login.body.error || 'OK')
const token = login.body.accessToken

const put = await request(app).put(`/api/summary/kdtu/${id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 10 })
console.log('PUT:', put.status, put.body)
