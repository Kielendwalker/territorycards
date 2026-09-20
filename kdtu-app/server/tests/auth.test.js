import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildTestApp } from './helpers/testApp.js'

// Per-describe app contexts so the in-memory rate-limit buckets don't leak
// across groups (each /api/auth/* group gets its own fresh limiter store).
let ctx
let refreshCtx

beforeAll(async () => {
  // Lift the rate-limit cap so a single test can exercise login + me + rotate
  // + me + refresh + me without tripping the production 5/15min ceiling.
  // The "Rate limiting" describe group explicitly resets this to '5' so its
  // 429 assertion still holds.
  process.env.KDTU_TEST_RATE_LIMIT_MAX = '1000'

  ctx = await buildTestApp({
    admin: { name: 'admin', password: 'correct-horse-battery-staple' },
    member: { name: 'Alice', pin: '1234' },
  })
})

afterAll(() => {
  if (ctx?.db) ctx.db.close()
  if (refreshCtx?.db) refreshCtx.db.close()
})

describe('POST /api/auth/login', () => {
  it('returns 200 + tokens + cookie for valid admin', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct-horse-battery-staple' })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.refreshToken).toBeTruthy()
    expect(res.body.role).toBe('admin')
    expect(res.body.user.name).toBe('admin')
    expect(res.body.mustChangePassword).toBe(false)
    const cookies = res.headers['set-cookie'] || []
    expect(cookies.some(c => c.startsWith('kdtu_session='))).toBe(true)
  })

  it('returns 401 for wrong password', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'WRONG' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('returns 400 for missing field', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'admin' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
    expect(res.body.fields?.password).toBeTruthy()
  })
})

describe('POST /api/auth/pin-login', () => {
  it('returns 200 for valid member + correct PIN', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/pin-login')
      .send({ memberName: 'Alice', pin: '1234' })
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('member')
    expect(res.body.accessToken).toBeTruthy()
  })

  it('returns 401 for wrong PIN', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/pin-login')
      .send({ memberName: 'Alice', pin: '0000' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })
})

describe('POST /api/auth/refresh', () => {
  let fresh
  beforeAll(async () => {
    fresh = await buildTestApp({
      admin: { name: 'admin', password: 'correct-horse-battery-staple' },
      member: { name: 'Bob', pin: '4242' },
    })
  })
  afterAll(() => { if (fresh?.db) fresh.db.close() })

  it('rotates a valid refresh token', async () => {
    const login = await request(fresh.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct-horse-battery-staple' })
    const oldRefresh = login.body.refreshToken
    const refresh = await request(fresh.app)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh })
    expect(refresh.status).toBe(200)
    expect(refresh.body.accessToken).toBeTruthy()
    expect(refresh.body.refreshToken).toBeTruthy()
    expect(refresh.body.refreshToken).not.toBe(oldRefresh)
    expect(refresh.body.mustChangePassword).toBe(false)
  })

  it('returns 401 when a rotated-out refresh token is reused', async () => {
    const login = await request(fresh.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct-horse-battery-staple' })
    const refresh1 = login.body.refreshToken
    // First refresh should succeed and rotate the token.
    const first = await request(fresh.app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh1 })
    expect(first.status).toBe(200)
    // Second use of the original refresh token is replay → reject.
    const second = await request(fresh.app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh1 })
    expect(second.status).toBe(401)
    expect(second.body.error).toBe('UNAUTHORIZED')
  })
})

describe('GET /api/auth/me', () => {
  let fresh
  beforeAll(async () => {
    fresh = await buildTestApp()
  })
  afterAll(() => { if (fresh?.db) fresh.db.close() })

  it('returns 401 without a token', async () => {
    const res = await request(fresh.app).get('/api/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('returns the current user for a valid admin token', async () => {
    const login = await request(fresh.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct-horse-battery-staple' })
    const access = login.body.accessToken
    const res = await request(fresh.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${access}`)
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('admin')
    expect(res.body.name).toBe('admin')
  })
})

describe('POST /api/auth/change-password', () => {
  let fresh
  beforeAll(async () => {
    fresh = await buildTestApp()
  })
  afterAll(() => { if (fresh?.db) fresh.db.close() })

  it('returns 400 for a short new password', async () => {
    const login = await request(fresh.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct-horse-battery-staple' })
    const access = login.body.accessToken
    const res = await request(fresh.app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send({ currentPassword: 'correct-horse-battery-staple', newPassword: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
  })

  it('returns 400 when new password equals current', async () => {
    const login = await request(fresh.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct-horse-battery-staple' })
    const access = login.body.accessToken
    const res = await request(fresh.app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send({ currentPassword: 'correct-horse-battery-staple', newPassword: 'correct-horse-battery-staple' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
  })

  it('rotates the password and clears must_change_password', async () => {
    // Build an app where the seeded admin must rotate. The 5/15min cap is
    // lifted via KDTU_TEST_RATE_LIMIT_MAX (set in the file-level beforeAll).
    const seeded = await buildTestApp({
      admin: {
        username: 'admin',
        password: 'correct-horse-battery-staple',
        display_name: 'admin',
        must_change_password: 1,
      },
    })
    try {
      const login = await request(seeded.app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'correct-horse-battery-staple' })
      expect(login.body.mustChangePassword).toBe(true)
      // /me is gated: must fail until rotation.
      const meBefore = await request(seeded.app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
      expect(meBefore.status).toBe(403)
      expect(meBefore.body.error).toBe('PASSWORD_RESET_REQUIRED')

      const rotate = await request(seeded.app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ currentPassword: 'correct-horse-battery-staple', newPassword: 'new-secret-pw-9876' })
      expect(rotate.status).toBe(200)
      expect(rotate.body.mustChangePassword).toBe(false)

      // Tokens issued before rotation still carry mcp=1 (signed before the
      // DB update), so /me still returns 403 with that token.
      const meAfter = await request(seeded.app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
      expect(meAfter.status).toBe(403)

      // Refreshing re-reads must_change_password from the DB and clears the
      // gate on the next access JWT.
      const refreshed = await request(seeded.app)
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
      expect(refreshed.status).toBe(200)
      expect(refreshed.body.mustChangePassword).toBe(false)
      const meRelogin = await request(seeded.app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      expect(meRelogin.status).toBe(200)
    } finally {
      seeded.db.close()
    }
  })
})

describe('Rate limiting', () => {
  it('returns 429 on the 6th login attempt within 15 minutes', async () => {
    // Restore the production ceiling so this assertion still triggers 429.
    process.env.KDTU_TEST_RATE_LIMIT_MAX = '5'
    const fresh = await buildTestApp({
      admin: { name: 'admin', password: 'correct-horse-battery-staple' },
      member: { name: 'Bob', pin: '4242' },
    })
    try {
      let lastStatus = 0
      for (let i = 0; i < 6; i += 1) {
        const r = await request(fresh.app)
          .post('/api/auth/login')
          .send({ username: 'admin', password: 'wrong-on-purpose' })
        lastStatus = r.status
      }
      expect(lastStatus).toBe(429)
    } finally {
      fresh.db.close()
    }
  })
})