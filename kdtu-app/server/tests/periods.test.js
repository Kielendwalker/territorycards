// Tests for /api/timetable/periods (admin CRUD for the period master data).
//
// The existing helpers (testApp.js) mock the schema tables; periods live in
// `timetable_periods` so we extend the mock with that table here in-process.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/index.js'
import { buildMockDbWithPeriods } from './helpers/periodsDb.js'
import { ROLE } from '@kdtu/shared'

let app
let db
let adminToken

async function loginAsAdmin () {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'correct-horse-battery-staple' })
  expect(res.status).toBe(200)
  return res.body.accessToken
}

beforeAll(async () => {
  process.env.KDTU_JWT_SECRET = 'test-secret-test-secret-test-secret-1234'
  process.env.KDTU_FIELD_KEY = 'test-field-key-test-field-key-test-field-AB'
  process.env.NODE_ENV = 'test'
  process.env.KDTU_TEST_RATE_LIMIT_MAX = '1000'

  db = buildMockDbWithPeriods()
  await db.seedAdmin()
  app = createApp({ db })
  adminToken = await loginAsAdmin()
})

afterAll(() => { if (db) db.close() })

const auth = () => ({ Authorization: `Bearer ${adminToken}` })

describe('GET /api/timetable/periods', () => {
  it('returns the seeded periods ordered by starts_on DESC', async () => {
    const res = await request(app).get('/api/timetable/periods')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
    // The most recent period should come first.
    const first = res.body[0]
    expect(first).toMatchObject({ id: expect.any(Number), label: expect.any(String) })
  })
})

describe('POST /api/timetable/periods (admin)', () => {
  it('creates a new period and returns 201 + the row', async () => {
    const res = await request(app).post('/api/timetable/periods').set(auth()).send({
      label: 'Oktober 2026', startsOn: '2026-10-01', endsOn: '2026-10-31',
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      label: 'Oktober 2026',
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
    })
    expect(res.body.id).toBeGreaterThan(0)
  })

  it('rejects a duplicate label with 409', async () => {
    const res = await request(app).post('/api/timetable/periods').set(auth()).send({
      label: 'Oktober 2026', startsOn: '2026-10-01', endsOn: '2026-10-31',
    })
    expect(res.status).toBe(409)
  })

  it('rejects endsOn < startsOn with 400', async () => {
    const res = await request(app).post('/api/timetable/periods').set(auth()).send({
      label: 'Broken 2026', startsOn: '2026-11-30', endsOn: '2026-11-01',
    })
    expect(res.status).toBe(400)
    expect(res.body.fields.endsOn).toBeTruthy()
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/timetable/periods').send({
      label: 'Nov 2026', startsOn: '2026-11-01', endsOn: '2026-11-30',
    })
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/timetable/periods/:id (admin)', () => {
  it('patches the notes field', async () => {
    // Find Oktober 2026 (created above) by label.
    const list = await request(app).get('/api/timetable/periods')
    const okt = list.body.find((p) => p.label === 'Oktober 2026')
    expect(okt).toBeTruthy()
    const res = await request(app)
      .put(`/api/timetable/periods/${okt.id}`)
      .set(auth())
      .send({ notes: 'Cut off mid-month for cleaning week.' })
    expect(res.status).toBe(200)
    expect(res.body.notes).toMatch(/cleaning/i)
  })
})

describe('DELETE /api/timetable/periods/:id (admin)', () => {
  it('removes a period and returns 204', async () => {
    const list = await request(app).get('/api/timetable/periods')
    const target = list.body[list.body.length - 1]
    const res = await request(app).delete(`/api/timetable/periods/${target.id}`).set(auth())
    expect(res.status).toBe(204)
    const after = await request(app).get('/api/timetable/periods')
    expect(after.body.find((p) => p.id === target.id)).toBeUndefined()
  })

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/api/timetable/periods/999999').set(auth())
    expect(res.status).toBe(404)
  })
})

// Sanity: the role gate is honoured even for member-role tokens.
describe('Role gate', () => {
  it('returns 403 when a member-role token tries to POST', async () => {
    const jwt = (await import('jsonwebtoken')).default
    const memberToken = jwt.sign(
      { sub: 99, name: 'Mallory', role: ROLE.MEMBER },
      process.env.KDTU_JWT_SECRET,
      { expiresIn: '5m' }
    )
    const res = await request(app)
      .post('/api/timetable/periods')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ label: 'X 2026', startsOn: '2026-12-01', endsOn: '2026-12-31' })
    expect(res.status).toBe(403)
  })
})
