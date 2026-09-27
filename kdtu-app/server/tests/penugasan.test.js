// Tests for /api/penugasan/* and penugasanService.
//
// Uses a fresh SQLCipher tmpfile DB per test app. The same handle is reused
// across the cases in this file so we can exercise migration apply + service
// init + HTTP routes end-to-end.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildPenugasanTestApp } from './helpers/penugasanApp.js'
import {
  seedPenugasanDataFromImage,
  listPenugasan,
  getPenugasan,
  createPenugasan,
  completePenugasan,
  NotFoundError,
  ValidationError,
} from '../src/services/penugasanService.js'

let ctx
let adminToken

beforeAll(async () => {
  ctx = await buildPenugasanTestApp({
    admin: { username: 'admin', password: 'correct-horse-battery-staple', display_name: 'Admin' },
  })
  // Login as admin to get a bearer token for the protected routes.
  const res = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'correct-horse-battery-staple' })
  expect(res.status).toBe(200)
  adminToken = res.body.accessToken
})

afterAll(() => {
  try { ctx?.db?.close() } catch {}
})

describe('penugasanService.seedPenugasanDataFromImage', () => {
  it('returns >= 8 seeded items referencing KDL 1', () => {
    const seeded = seedPenugasanDataFromImage(ctx.db, { kdlId: 1 })
    expect(Array.isArray(seeded)).toBe(true)
    expect(seeded.length).toBeGreaterThanOrEqual(8)
    for (const row of seeded) {
      expect(row.kdlId).toBe(1)
      expect(['PENDING', 'IN_PROGRESS', 'DONE']).toContain(row.status)
    }
    const statuses = new Set(seeded.map(r => r.status))
    // Diverse statuses required.
    expect(statuses.size).toBeGreaterThanOrEqual(2)
  })

  it('is idempotent on (kdl_id, title)', () => {
    const before = listPenugasan(ctx.db, { kdlId: 1 }).length
    seedPenugasanDataFromImage(ctx.db, { kdlId: 1 })
    const after = listPenugasan(ctx.db, { kdlId: 1 }).length
    expect(after).toBe(before)
  })
})

describe('GET /api/penugasan', () => {
  it('401 without auth', async () => {
    const res = await request(ctx.app).get('/api/penugasan')
    expect(res.status).toBe(401)
  })

  it('returns list filtered by ?kdlId=N', async () => {
    // Create a penugasan for KDL 2 so we can distinguish.
    createPenugasan(ctx.db, { kdlId: 2, title: 'KDL2 task', status: 'PENDING', description: null, dueOn: null })
    const res = await request(ctx.app)
      .get('/api/penugasan?kdlId=2')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.every(r => r.kdlId === 2)).toBe(true)
    expect(res.body.some(r => r.title === 'KDL2 task')).toBe(true)
  })

  it('returns 400 for non-integer kdlId', async () => {
    const res = await request(ctx.app)
      .get('/api/penugasan?kdlId=abc')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/penugasan (admin)', () => {
  it('401 without auth', async () => {
    const res = await request(ctx.app)
      .post('/api/penugasan')
      .send({ kdlId: 1, title: 'no auth' })
    expect(res.status).toBe(401)
  })

  it('creates a penugasan', async () => {
    const res = await request(ctx.app)
      .post('/api/penugasan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kdlId: 1,
        title: 'Test Penugasan',
        description: 'A new item',
        dueOn: '2026-10-10',
        status: 'PENDING',
      })
    expect(res.status).toBe(200)
    expect(res.body.id).toBeTruthy()
    expect(res.body.title).toBe('Test Penugasan')
    expect(res.body.kdlId).toBe(1)
    expect(res.body.status).toBe('PENDING')
    expect(res.body.dueOn).toBe('2026-10-10')

    // Round-trip via GET.
    const got = await request(ctx.app)
      .get(`/api/penugasan/${res.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(got.status).toBe(200)
    expect(got.body.id).toBe(res.body.id)
  })

  it('404 when kdlId does not exist', async () => {
    const res = await request(ctx.app)
      .post('/api/penugasan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kdlId: 99999, title: 'orphan' })
    expect(res.status).toBe(404)
  })

  it('400 for invalid status', async () => {
    const res = await request(ctx.app)
      .post('/api/penugasan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kdlId: 1, title: 'bad-status', status: 'NOPE' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
    expect(res.body.fields && res.body.fields.status).toBeTruthy()
  })

  it('400 for bad dueOn', async () => {
    const res = await request(ctx.app)
      .post('/api/penugasan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kdlId: 1, title: 'bad-due', dueOn: 'yesterday' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
    expect(res.body.fields && res.body.fields.dueOn).toBeTruthy()
  })
})

describe('PUT /api/penugasan/:id (admin)', () => {
  let id
  beforeAll(() => {
    const created = createPenugasan(ctx.db, { kdlId: 1, title: 'to-update' })
    id = created.id
  })

  it('updates title, description, status', async () => {
    const res = await request(ctx.app)
      .put(`/api/penugasan/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'renamed', description: 'new desc', status: 'IN_PROGRESS' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('renamed')
    expect(res.body.description).toBe('new desc')
    expect(res.body.status).toBe('IN_PROGRESS')

    const got = getPenugasan(ctx.db, id)
    expect(got.title).toBe('renamed')
  })

  it('400 for bad status', async () => {
    const res = await request(ctx.app)
      .put(`/api/penugasan/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OOPS' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/penugasan/:id (admin)', () => {
  let id
  beforeAll(() => {
    id = createPenugasan(ctx.db, { kdlId: 1, title: 'to-delete' }).id
  })

  it('removes the row', async () => {
    const res = await request(ctx.app)
      .delete(`/api/penugasan/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const got = await request(ctx.app)
      .get(`/api/penugasan/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(got.status).toBe(404)
  })
})

describe('POST /api/penugasan/:id/complete', () => {
  let id
  beforeAll(() => {
    id = createPenugasan(ctx.db, { kdlId: 1, title: 'to-complete', status: 'PENDING' }).id
  })

  it('sets status=DONE and completedAt populated', async () => {
    const res = await request(ctx.app)
      .post(`/api/penugasan/${id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DONE')
    expect(res.body.completedAt).toBeTruthy()
    // Should be a valid ISO timestamp.
    expect(Number.isNaN(Date.parse(res.body.completedAt))).toBe(false)

    // confirm via service
    const got = getPenugasan(ctx.db, id)
    expect(got.status).toBe('DONE')
    expect(got.completedAt).toBeTruthy()
  })

  it('401 without auth', async () => {
    const other = createPenugasan(ctx.db, { kdlId: 1, title: 'no-auth-complete' }).id
    const res = await request(ctx.app).post(`/api/penugasan/${other}/complete`)
    expect(res.status).toBe(401)
  })

  it('404 for non-existent id', async () => {
    const res = await request(ctx.app)
      .post(`/api/penugasan/9999999/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })
})

describe('service error classes', () => {
  it('NotFoundError for missing penugasan', () => {
    expect(() => getPenugasan(ctx.db, 9999999)).toThrow(NotFoundError)
  })

  it('ValidationError for missing kdlId on create', () => {
    expect(() => createPenugasan(ctx.db, { title: 'no-kdl' })).toThrow(ValidationError)
  })
})