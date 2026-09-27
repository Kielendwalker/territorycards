import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildTestApp } from './helpers/testApp.js'

let ctx

beforeAll(async () => {
  ctx = await buildTestApp()
})

afterAll(() => {
  if (ctx?.db) ctx.db.close()
})

describe('Security headers', () => {
  it('sets helmet headers including CSP, X-Content-Type-Options, Referrer-Policy', async () => {
    const res = await request(ctx.app).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.headers['content-security-policy']).toBeTruthy()
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['referrer-policy']).toBeTruthy()
  })

  it('does not leak X-Powered-By', async () => {
    const res = await request(ctx.app).get('/healthz')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('sets Strict-Transport-Security with includeSubDomains', async () => {
    const res = await request(ctx.app).get('/healthz')
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/)
    expect(res.headers['strict-transport-security']).toMatch(/includeSubDomains/)
  })

  it('sets Cross-Origin-Opener-Policy same-origin', async () => {
    const res = await request(ctx.app).get('/healthz')
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin')
  })

  it('denies framing via X-Frame-Options DENY', async () => {
    const res = await request(ctx.app).get('/healthz')
    expect(res.headers['x-frame-options']).toBe('DENY')
  })

  it('CSP blocks object-src and external form-action targets', async () => {
    const res = await request(ctx.app).get('/healthz')
    const csp = res.headers['content-security-policy']
    expect(csp).toMatch(/object-src 'none'/)
    expect(csp).toMatch(/form-action 'self'/)
    expect(csp).toMatch(/frame-ancestors 'none'/)
  })
})

describe('CORS', () => {
  it('preflight from an allowed origin returns correct Access-Control-Allow-Origin', async () => {
    const res = await request(ctx.app)
      .options('/api/auth/me')
      .set('Origin', 'http://localhost:5181')
      .set('Access-Control-Request-Method', 'GET')
    expect([200, 204]).toContain(res.status)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5181')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('disallows a non-allow-listed origin', async () => {
    const res = await request(ctx.app)
      .options('/api/auth/me')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'GET')
    expect(res.status).toBe(403)
  })
})

describe('Unknown /api routes return JSON 404 (not HTML)', () => {
  it('returns a JSON envelope for /api/does-not-exist', async () => {
    const res = await request(ctx.app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body.error).toBe('NOT_FOUND')
  })
})

describe('Member login is disabled', () => {
  it('POST /api/auth/pin-login returns 410 Gone with a clear message', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/pin-login')
      .send({ memberName: 'Alice', pin: '1234' })
    expect(res.status).toBe(410)
    expect(res.body.message).toMatch(/Member login is disabled/)
  })

  it('pin-login does NOT issue tokens even with valid credentials', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/pin-login')
      .send({ memberName: 'Alice', pin: '1234' })
    expect(res.body.accessToken).toBeUndefined()
    expect(res.body.refreshToken).toBeUndefined()
  })
})