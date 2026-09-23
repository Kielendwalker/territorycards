// KDL feature tests — supertest + a fresh SQLCipher tmpfile DB.
//
// Each `describe` group builds its own DB + app so the seed migrations and
// assertions are isolated. The DB is built using better-sqlite3-multiple-ciphers
// against a tmpfile (in-memory is unreliable with SQLCipher on some builds).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3-multiple-ciphers'
import argon2 from 'argon2'
import express from 'express'

import { applySchema } from '../src/db/migrate.js'
import { authenticate, requireRole } from '../src/middleware/auth.js'
import { helmetMiddleware, corsMiddleware, compressionMiddleware, morganMiddleware, jsonMiddleware } from '../src/middleware/security.js'
import { generalRateLimit } from '../src/middleware/rateLimit.js'
import { audit, errorHandler } from '../src/middleware/audit.js'
import { createKdlRouter } from '../src/routes/kdl.js'
import { createAuthRouter } from '../src/routes/auth.js'

process.env.KDTU_DB_KEY    = 'test-db-key-must-be-at-least-32-characters-long-AA'
process.env.KDTU_FIELD_KEY = 'test-field-key-must-be-at-least-32-characters-long-BB'
process.env.KDTU_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long-CCCC'

const DB_KEY = process.env.KDTU_DB_KEY

function openTmpDb () {
  const dir = mkdtempSync(join(tmpdir(), 'kdl-test-'))
  const file = join(dir, 'kdl.db')
  writeFileSync(file, '')
  const db = new Database(file)
  db.pragma("cipher='sqlcipher'")
  db.pragma(`key="${DB_KEY.replace(/"/g, '""')}"`)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applySchema(db)
  return db
}

function buildApp (db) {
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
  app.use('/api/kdl', createKdlRouter())
  app.use('/api/auth', createAuthRouter())
  app.use(errorHandler)
  return app
}

async function seedAdmin (db, password = 'correct-horse-battery-staple') {
  const hash = await argon2.hash(password, { type: argon2.argon2id })
  const info = db.prepare("INSERT INTO admins (username, password_hash, display_name) VALUES (?, ?, ?)").run('admin', hash, 'admin')
  return { id: info.lastInsertRowid, username: 'admin', password }
}

async function loginAdmin (app, password = 'correct-horse-battery-staple') {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password })
  expect(res.status).toBe(200)
  return res.body.accessToken
}

describe('KDL endpoints', () => {
  let db, app, ctx
  beforeEach(async () => {
    db = openTmpDb()
    app = buildApp(db)
    const admin = await seedAdmin(db)
    const token = await loginAdmin(app, admin.password)
    ctx = { db, app, token, admin }
  })
  afterEach(() => { try { db.close() } catch {} })

  // 1. Unauth POST → 401.
  it('rejects unauthenticated POST /api/kdl with 401', async () => {
    const res = await request(app).post('/api/kdl').send({ name: 'KDL Test' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  // 2. Admin POST creates KDL.
  it('admin POST /api/kdl creates a KDL', async () => {
    const res = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'KDL Test', leader: 'Sdr. Test', meetingDay: 'Sabtu', meetingTime: '15:00', location: 'Rumah Test' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('KDL Test')
    expect(res.body.leader).toBe('Sdr. Test')
    expect(res.body.meetingTime).toBe('15:00')
    expect(res.body.location).toBe('Rumah Test')
    expect(res.body.memberCount).toBe(0)
  })

  // 3. GET /api/kdl returns memberCount.
  it('GET /api/kdl returns the seeded list with memberCount', async () => {
    const res = await request(app).get('/api/kdl')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Bootstrap seeds 4 KDLs.
    expect(res.body.length).toBe(4)
    for (const k of res.body) {
      expect(typeof k.memberCount).toBe('number')
      expect(k).toHaveProperty('name')
    }
  })

  // 4. Attaching a member updates memberCount.
  it('POST /api/kdl/:id/members increments memberCount', async () => {
    const created = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'KDL Attach' })
    expect(created.status).toBe(201)
    const kdlId = created.body.id

    // Create a member (no encryption needed for kdl_id assignment).
    const m1 = db.prepare("INSERT INTO members (name_enc, pin_hash, active) VALUES (?, ?, 1)").run(Buffer.from('m1'), 'h')
    const m2 = db.prepare("INSERT INTO members (name_enc, pin_hash, active) VALUES (?, ?, 1)").run(Buffer.from('m2'), 'h')

    const a1 = await request(app)
      .post(`/api/kdl/${kdlId}/members`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ memberId: m1.lastInsertRowid })
    expect(a1.status).toBe(201)

    let detail = await request(app).get(`/api/kdl/${kdlId}`)
    expect(detail.body.memberCount).toBe(1)

    const a2 = await request(app)
      .post(`/api/kdl/${kdlId}/members`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ memberId: m2.lastInsertRowid })
    expect(a2.status).toBe(201)

    detail = await request(app).get(`/api/kdl/${kdlId}`)
    expect(detail.body.memberCount).toBe(2)
  })

  // 5. Detaching a member updates memberCount.
  it('DELETE /api/kdl/:id/members/:memberId decrements memberCount', async () => {
    const created = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'KDL Detach' })
    const kdlId = created.body.id
    const m = db.prepare("INSERT INTO members (name_enc, pin_hash, active) VALUES (?, ?, 1)").run(Buffer.from('mx'), 'h')
    const memberId = m.lastInsertRowid

    await request(app).post(`/api/kdl/${kdlId}/members`)
      .set('Authorization', `Bearer ${ctx.token}`).send({ memberId })

    const before = await request(app).get(`/api/kdl/${kdlId}`)
    expect(before.body.memberCount).toBe(1)

    const del = await request(app)
      .delete(`/api/kdl/${kdlId}/members/${memberId}`)
      .set('Authorization', `Bearer ${ctx.token}`)
    expect(del.status).toBe(200)

    const after = await request(app).get(`/api/kdl/${kdlId}`)
    expect(after.body.memberCount).toBe(0)
  })

  // 6. DELETE KDL with members attached → members.kdl_id becomes NULL.
  it('DELETE /api/kdl/:id with members attached sets members.kdl_id to NULL', async () => {
    const created = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'KDL Cascade' })
    const kdlId = created.body.id
    const m1 = db.prepare("INSERT INTO members (name_enc, pin_hash, active) VALUES (?, ?, 1)").run(Buffer.from('c1'), 'h')
    const m2 = db.prepare("INSERT INTO members (name_enc, pin_hash, active) VALUES (?, ?, 1)").run(Buffer.from('c2'), 'h')
    db.prepare('UPDATE members SET kdl_id = ? WHERE id = ?').run(kdlId, m1.lastInsertRowid)
    db.prepare('UPDATE members SET kdl_id = ? WHERE id = ?').run(kdlId, m2.lastInsertRowid)

    const del = await request(app)
      .delete(`/api/kdl/${kdlId}`)
      .set('Authorization', `Bearer ${ctx.token}`)
    expect(del.status).toBe(200)

    const still = db.prepare('SELECT kdl_id FROM members WHERE id IN (?, ?)').all(m1.lastInsertRowid, m2.lastInsertRowid)
    for (const row of still) {
      expect(row.kdl_id).toBeNull()
    }
  })

  // 7. Validation: name too short → 400.
  it('POST /api/kdl rejects a too-short name with 400', async () => {
    const res = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'K' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
    expect(res.body.fields?.name).toBeTruthy()
  })

  // 8. Conflict: duplicate name → 409.
  it('POST /api/kdl with a duplicate name returns 409', async () => {
    const first = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'KDL Duplicate' })
    expect(first.status).toBe(201)
    const dup = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'KDL Duplicate' })
    expect(dup.status).toBe(409)
    expect(dup.body.error).toBe('CONFLICT')
  })

  // 9. GET /api/kdl/:id/members returns the attached members.
  it('GET /api/kdl/:id/members returns the attached members', async () => {
    const created = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'KDL List Members' })
    const kdlId = created.body.id
    const m1 = db.prepare("INSERT INTO members (name_enc, pin_hash, active) VALUES (?, ?, 1)").run(Buffer.from('a'), 'h')
    const m2 = db.prepare("INSERT INTO members (name_enc, pin_hash, active) VALUES (?, ?, 1)").run(Buffer.from('b'), 'h')
    db.prepare('UPDATE members SET kdl_id = ? WHERE id = ?').run(kdlId, m1.lastInsertRowid)
    db.prepare('UPDATE members SET kdl_id = ? WHERE id = ?').run(kdlId, m2.lastInsertRowid)

    const res = await request(app).get(`/api/kdl/${kdlId}/members`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
    const ids = res.body.map(m => m.id).sort()
    expect(ids).toEqual([m1.lastInsertRowid, m2.lastInsertRowid].sort())
  })

  // 10. GET /api/kdl/:id/penugasan passthrough returns the penugasan rows.
  it('GET /api/kdl/:id/penugasan returns the penugasan rows for that KDL', async () => {
    const created = await request(app)
      .post('/api/kdl')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ name: 'KDL Penugasan' })
    const kdlId = created.body.id
    // Insert a separate KDL row so we can attach an "other" penugasan without
    // hitting the FK constraint (kdl_id REFERENCES kdl(id)).
    db.prepare("INSERT OR IGNORE INTO kdl (id, name) VALUES (999, 'Other')").run()
    db.prepare('INSERT INTO penugasan (kdl_id, title, description, due_on, status) VALUES (?, ?, ?, ?, ?)').run(kdlId, 'Pembagian Brosur', '5 RW 4', '2026-10-01', 'PENDING')
    db.prepare('INSERT INTO penugasan (kdl_id, title, description, due_on, status) VALUES (?, ?, ?, ?, ?)').run(kdlId, 'Video Pendek', null, null, 'IN_PROGRESS')
    // Row for another KDL — must not show up.
    db.prepare('INSERT INTO penugasan (kdl_id, title, description, due_on, status) VALUES (?, ?, ?, ?, ?)').run(999, 'Other', null, null, 'PENDING')

    const res = await request(app).get(`/api/kdl/${kdlId}/penugasan`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
    const titles = res.body.map(p => p.title).sort()
    expect(titles).toEqual(['Pembagian Brosur', 'Video Pendek'])
    for (const p of res.body) {
      expect(p.kdlId).toBe(kdlId)
    }
  })
})
