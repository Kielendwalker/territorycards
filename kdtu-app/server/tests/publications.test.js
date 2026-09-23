// Tests for /api/publications and /api/timetable/periods/:periodId/publications.
//
// We build a small focused mock DB (publications, timetable_periods,
// timetable_publications) and a tiny Express app that wires the
// authenticate/requireRole middleware against a pre-signed admin JWT.
// This keeps the publications surface isolated from auth/security tests.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { signAccess } from '../src/utils/jwt.js'
import { ROLE, ERROR_CODES, PUBLICATION_CATEGORY } from '@kdtu/shared'
import { authenticate, requireRole } from '../src/middleware/auth.js'
import { createPublicationsRouter } from '../src/routes/publications.js'

// Deterministic secrets BEFORE any module that touches them loads.
process.env.KDTU_DB_KEY    = 'test-db-key-must-be-at-least-32-characters-long-AA'
process.env.KDTU_FIELD_KEY = 'test-field-key-must-be-at-least-32-characters-long-BB'
process.env.KDTU_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long-CCCC'

// ---- A minimal in-memory mock DB -----------------------------------------
function createMockDb () {
  const tables = {
    publications: [],
    timetable_periods: [],
    timetable_publications: [],
  }
  const autoInc = { publications: 0, timetable_periods: 0 }

  function nextId (t) { autoInc[t] += 1; return autoInc[t] }

  function allRows (t) { return tables[t].slice() }

  function rowMatches (row, conds) {
    for (const [col, val] of Object.entries(conds)) {
      if (row[col] !== val) return false
    }
    return true
  }

  function compileWhere (sql) {
    // Extract WHERE clause + ordered ? markers (very small grammar; just
    // supports `WHERE col = ? [AND col = ?]` for our needs).
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER BY|$)/i)
    if (!whereMatch) return { conds: [], rest: sql }
    const clause = whereMatch[1]
    const cols = [...clause.matchAll(/(\w+)\s*=\s*\?/gi)].map(m => m[1])
    return { conds: cols, rest: sql }
  }

  function pickTable (sql) {
    const upper = sql.toUpperCase()
    if (/FROM\s+PUBLICATIONS/i.test(upper) && /JOIN/.test(upper) === false) return 'publications'
    if (/FROM\s+TIMETABLE_PERIODS/i.test(upper)) return 'timetable_periods'
    if (/FROM\s+TIMETABLE_PUBLICATIONS/i.test(upper)) return 'timetable_publications'
    if (/JOIN\s+PUBLICATIONS/.test(upper)) return 'timetable_publications'
    return null
  }

  function parseParams (sql, params) {
    const { conds } = compileWhere(sql)
    const result = {}
    conds.forEach((c, i) => { result[c] = params[i] })
    return result
  }

  function prepare (sql) {
    const trimmed = sql.trim()
    const upper = trimmed.toUpperCase()
    const table = pickTable(trimmed)

    return {
      get (...params) {
        if (!table) return undefined
        const conds = parseParams(trimmed, params)
        return allRows(table).find(r => rowMatches(r, conds))
      },
      all (...params) {
        if (!table) return []
        const conds = parseParams(trimmed, params)
        return allRows(table).filter(r => rowMatches(r, conds)).map(r => {
          // JOIN: timetable_publications joined with publications
          if (upper.includes('JOIN PUBLICATIONS')) {
            const pub = tables.publications.find(p => p.id === r.publication_id)
            if (!pub) return null
            return {
              publicationId: r.publication_id,
              title: pub.title,
              category: pub.category,
              quantity: r.quantity,
            }
          }
          return { ...r }
        }).filter(Boolean)
      },
      run (...params) {
        if (upper.startsWith('INSERT INTO PUBLICATIONS')) {
          // UNIQUE(category, title, edition) — edition=null treated as equal
          // to other nulls (SQLite standard). Match that here.
          const dup = tables.publications.some(p =>
            p.category === params[0] &&
            p.title === params[1] &&
            (p.edition ?? null) === (params[2] ?? null)
          )
          if (dup) {
            throw new Error('UNIQUE constraint failed: publications')
          }
          const id = nextId('publications')
          tables.publications.push({
            id,
            category: params[0],
            title: params[1],
            edition: params[2] ?? null,
            stock: params[3] ?? 0,
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO TIMETABLE_PERIODS')) {
          const id = nextId('timetable_periods')
          tables.timetable_periods.push({
            id,
            label: params[0],
            starts_on: params[1],
            ends_on: params[2],
            notes: params[3] ?? null,
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO TIMETABLE_PUBLICATIONS')) {
          // Detect duplicate by PK
          const exists = tables.timetable_publications.some(r =>
            r.period_id === params[0] && r.publication_id === params[1]
          )
          if (exists) {
            const err = new Error('UNIQUE constraint failed: timetable_publications')
            throw err
          }
          tables.timetable_publications.push({
            period_id: params[0],
            publication_id: params[1],
            quantity: params[2],
          })
          return { changes: 1 }
        }
        if (upper.startsWith('UPDATE PUBLICATIONS')) {
          const id = params[params.length - 1]
          const row = tables.publications.find(p => p.id === id)
          if (!row) return { changes: 0 }
          // Detect UNIQUE collision against OTHER rows after the patch.
          const dup = tables.publications.some(p =>
            p.id !== id &&
            p.category === params[0] &&
            p.title === params[1] &&
            (p.edition ?? null) === (params[2] ?? null)
          )
          if (dup) throw new Error('UNIQUE constraint failed: publications')
          // SET order: category, title, edition, stock
          row.category = params[0]
          row.title = params[1]
          row.edition = params[2]
          row.stock = params[3]
          return { changes: 1 }
        }
        if (upper.startsWith('UPDATE TIMETABLE_PUBLICATIONS')) {
          const qty = params[0]; const periodId = params[1]; const pubId = params[2]
          const row = tables.timetable_publications.find(r => r.period_id === periodId && r.publication_id === pubId)
          if (!row) return { changes: 0 }
          row.quantity = qty
          return { changes: 1 }
        }
        if (upper.startsWith('DELETE FROM PUBLICATIONS')) {
          const id = params[0]
          const before = tables.publications.length
          tables.publications = tables.publications.filter(p => p.id !== id)
          return { changes: before - tables.publications.length }
        }
        if (upper.startsWith('DELETE FROM TIMETABLE_PUBLICATIONS')) {
          const periodId = params[0]; const pubId = params[1]
          const before = tables.timetable_publications.length
          tables.timetable_publications = tables.timetable_publications.filter(
            r => !(r.period_id === periodId && r.publication_id === pubId)
          )
          return { changes: before - tables.timetable_publications.length }
        }
        throw new Error(`mock db: unhandled run(): ${trimmed}`)
      },
    }
  }

  function exec () {}
  function transaction (fn) { return (...args) => fn(...args) }
  function close () {}
  function pragma () {}
  return { prepare, exec, transaction, close, pragma, _tables: tables }
}

// Build a tiny app that just hosts the publications router, with auth.
function buildApp (db) {
  const app = express()
  app.use(express.json())
  app.locals.db = db
  app.use('/api', createPublicationsRouter())
  return app
}

// ---- Test suite ----------------------------------------------------------

let db
let app
let adminToken

beforeAll(() => {
  db = createMockDb()
  // Seed one period for the join tests.
  db.prepare('INSERT INTO timetable_periods (label, starts_on, ends_on) VALUES (?, ?, ?)')
    .run('September 2026', '2026-09-01', '2026-09-30')
  app = buildApp(db)
  adminToken = signAccess({ sub: 1, name: 'admin', role: ROLE.ADMIN })
})

afterAll(() => {
  if (db) db.close()
})

function authHeader (token = adminToken) {
  return { Authorization: `Bearer ${token}` }
}

// 1. GET /api/publications lists publications.
describe('GET /api/publications', () => {
  it('returns the publication list (initially empty)', async () => {
    const res = await request(app).get('/api/publications')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('lists publications with category filter', async () => {
    db.prepare('INSERT INTO publications (category, title, edition, stock) VALUES (?, ?, ?, ?)')
      .run(PUBLICATION_CATEGORY.MAJALAH, 'Menara Pengawal', 'No. 1', 50)
    db.prepare('INSERT INTO publications (category, title, edition, stock) VALUES (?, ?, ?, ?)')
      .run(PUBLICATION_CATEGORY.RISALAH, 'Sedarlah!', null, 100)

    const res = await request(app)
      .get('/api/publications')
      .query({ category: PUBLICATION_CATEGORY.MAJALAH })
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
    expect(res.body[0].title).toBe('Menara Pengawal')
    expect(res.body[0].category).toBe('Majalah')
  })
})

// 2. Admin POST creates publication; duplicate returns 409.
describe('POST /api/publications', () => {
  it('rejects unauthenticated POSTs', async () => {
    const res = await request(app)
      .post('/api/publications')
      .send({ category: PUBLICATION_CATEGORY.BUKU, title: 'Buku A' })
    expect(res.status).toBe(401)
  })

  it('creates a publication when admin', async () => {
    const res = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.BUKU, title: 'Buku Baru', stock: 25 })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    expect(res.body.category).toBe('Buku')
    expect(res.body.title).toBe('Buku Baru')
    expect(res.body.stock).toBe(25)
    expect(res.body.edition).toBeNull()
  })

  it('returns 409 on duplicate category+title+edition', async () => {
    const dup = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.BUKU, title: 'Buku Dup' })
    expect(dup.status).toBe(201)

    const second = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.BUKU, title: 'Buku Dup' })
    expect(second.status).toBe(409)
    expect(second.body.error).toBe(ERROR_CODES.CONFLICT)
  })
})

// 3. PUT updates stock.
describe('PUT /api/publications/:id', () => {
  it('updates stock', async () => {
    const create = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.BROSUR, title: 'Brosur X' })
    expect(create.status).toBe(201)
    const id = create.body.id

    const upd = await request(app)
      .put(`/api/publications/${id}`)
      .set(authHeader())
      .send({ stock: 17 })
    expect(upd.status).toBe(200)
    expect(upd.body.stock).toBe(17)
  })
})

// 4. DELETE removes publication.
describe('DELETE /api/publications/:id', () => {
  it('removes a publication', async () => {
    const create = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.LAINNYA, title: 'Lainnya A' })
    const id = create.body.id

    const del = await request(app)
      .delete(`/api/publications/${id}`)
      .set(authHeader())
    expect(del.status).toBe(204)

    const after = await request(app).get(`/api/publications/${id}`)
    expect(after.status).toBe(404)
  })
})

// 5. Attach publication to period.
describe('POST /api/timetable/periods/:periodId/publications', () => {
  it('attaches a publication to a period', async () => {
    const create = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.RISALAH, title: 'Risalah Attach' })
    const publicationId = create.body.id

    const res = await request(app)
      .post('/api/timetable/periods/1/publications')
      .set(authHeader())
      .send({ publicationId, quantity: 30 })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ periodId: 1, publicationId, quantity: 30 })
  })

  it('returns 409 on duplicate attach', async () => {
    const create = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.RISALAH, title: 'Risalah Dup2' })
    const publicationId = create.body.id

    await request(app)
      .post('/api/timetable/periods/1/publications')
      .set(authHeader())
      .send({ publicationId, quantity: 5 })
    const second = await request(app)
      .post('/api/timetable/periods/1/publications')
      .set(authHeader())
      .send({ publicationId, quantity: 7 })
    expect(second.status).toBe(409)
  })
})

// 6. Update quantity on period.
describe('PUT /api/timetable/periods/:periodId/publications/:publicationId', () => {
  it('updates the quantity of an attached publication', async () => {
    const create = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.MAJALAH, title: 'Majalah Q' })
    const publicationId = create.body.id
    await request(app)
      .post('/api/timetable/periods/1/publications')
      .set(authHeader())
      .send({ publicationId, quantity: 4 })

    const upd = await request(app)
      .put(`/api/timetable/periods/1/publications/${publicationId}`)
      .set(authHeader())
      .send({ quantity: 99 })
    expect(upd.status).toBe(200)
    expect(upd.body.quantity).toBe(99)
  })
})

// 7. Detach from period.
describe('DELETE /api/timetable/periods/:periodId/publications/:publicationId', () => {
  it('detaches a publication from a period', async () => {
    const create = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.BUKU, title: 'Buku Detach' })
    const publicationId = create.body.id
    await request(app)
      .post('/api/timetable/periods/1/publications')
      .set(authHeader())
      .send({ publicationId, quantity: 12 })

    const del = await request(app)
      .delete(`/api/timetable/periods/1/publications/${publicationId}`)
      .set(authHeader())
    expect(del.status).toBe(204)
  })
})

// 8. GET /api/timetable/periods/:id/publications returns rows.
describe('GET /api/timetable/periods/:periodId/publications', () => {
  it('returns the list of attached publications for the period', async () => {
    // Period 2 to isolate from above tests.
    db.prepare('INSERT INTO timetable_periods (label, starts_on, ends_on) VALUES (?, ?, ?)')
      .run('October 2026', '2026-10-01', '2026-10-31')

    const a = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.MAJALAH, title: 'M-P2-1' })
    const b = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.RISALAH, title: 'R-P2-2' })

    await request(app)
      .post('/api/timetable/periods/2/publications')
      .set(authHeader())
      .send({ publicationId: a.body.id, quantity: 5 })
    await request(app)
      .post('/api/timetable/periods/2/publications')
      .set(authHeader())
      .send({ publicationId: b.body.id, quantity: 10 })

    const res = await request(app).get('/api/timetable/periods/2/publications')
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
    const titles = res.body.map(r => r.title).sort()
    expect(titles).toEqual(['M-P2-1', 'R-P2-2'])
    for (const row of res.body) {
      expect(typeof row.publicationId).toBe('number')
      expect(typeof row.title).toBe('string')
      expect(typeof row.category).toBe('string')
      expect(typeof row.quantity).toBe('number')
    }
  })
})

// 9. Validation: bad category -> 400.
describe('Validation', () => {
  it('rejects an unknown category with 400', async () => {
    const res = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: 'Majelis', title: 'X' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(ERROR_CODES.VALIDATION)
  })

  it('rejects a non-integer quantity with 400', async () => {
    const create = await request(app)
      .post('/api/publications')
      .set(authHeader())
      .send({ category: PUBLICATION_CATEGORY.BROSUR, title: 'Brosur Q' })
    const res = await request(app)
      .post('/api/timetable/periods/1/publications')
      .set(authHeader())
      .send({ publicationId: create.body.id, quantity: -3 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(ERROR_CODES.VALIDATION)
  })
})
