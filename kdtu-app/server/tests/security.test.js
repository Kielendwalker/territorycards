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
