// Verifies:
//   - openDb() succeeds against an in-memory (or tmpfile) encrypted DB
//   - schema applies; all expected tables exist
//   - encryptField -> decryptField round-trips
//   - tampered ciphertext throws
//   - derived AES key is 32 bytes
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Deterministic 32+ char keys BEFORE the modules load.
process.env.KDTU_DB_KEY    = 'test-db-key-must-be-at-least-32-characters-long-AA'
process.env.KDTU_FIELD_KEY = 'test-field-key-must-be-at-least-32-characters-long-BB'
process.env.KDTU_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long-CCCC'

const EXPECTED_TABLES = [
  'admins',
  'members',
  'locations',
  'timetable_periods',
  'timetable_assignments',
  'timetable_assignment_members',
  'kdl',
  'penugasan',
  'publications',
  'timetable_publications',
  'kdtu_summary_entries',
  'audit_log',
]

describe('utils/crypto.js', () => {
  it('deriveKey returns a 32-byte buffer', async () => {
    const { deriveKey } = await import('../src/utils/crypto.js')
    const k = deriveKey(process.env.KDTU_FIELD_KEY)
    expect(Buffer.isBuffer(k)).toBe(true)
    expect(k.length).toBe(32)
  })

  it('deriveKey rejects short keys', async () => {
    const { deriveKey } = await import('../src/utils/crypto.js')
    expect(() => deriveKey('short')).toThrow(/32 chars/)
  })

  it('encryptField -> decryptField round-trips', async () => {
    const { deriveKey, encryptField, decryptField } = await import('../src/utils/crypto.js')
    const k = deriveKey(process.env.KDTU_FIELD_KEY)
    const plain = 'Halo dunia 名字-测试'
    const blob = encryptField(plain, k)
    expect(Buffer.isBuffer(blob)).toBe(true)
    // nonce(12) + tag(16) + ciphertext(>=1)
    expect(blob.length).toBeGreaterThan(28)
    expect(decryptField(blob, k)).toBe(plain)
  })

  it('tampered ciphertext throws', async () => {
    const { deriveKey, encryptField, decryptField } = await import('../src/utils/crypto.js')
    const k = deriveKey(process.env.KDTU_FIELD_KEY)
    const blob = encryptField('secret', k)
    // Flip one bit in the ciphertext portion (offset >= 28).
    const tampered = Buffer.from(blob)
    tampered[tampered.length - 1] ^= 0x01
    expect(() => decryptField(tampered, k)).toThrow()
  })

  it('short blob throws', async () => {
    const { deriveKey, decryptField } = await import('../src/utils/crypto.js')
    const k = deriveKey(process.env.KDTU_FIELD_KEY)
    expect(() => decryptField(Buffer.alloc(10), k)).toThrow(/too short/)
  })
})

describe('db/index.js', () => {
  let openDb, closeDb, getDb

  beforeAll(async () => {
    const mod = await import('../src/db/index.js')
    openDb = mod.openDb; closeDb = mod.closeDb; getDb = mod.getDb
    // Try in-memory first; fall back to tmpfile because some better-sqlite3
    // builds can't run :memory: with SQLCipher. Detect and adapt.
    let opened = false
    try {
      openDb({ dbKey: process.env.KDTU_DB_KEY, inMemory: true })
      opened = true
    } catch {
      const dir = mkdtempSync(join(tmpdir(), 'kdtu-db-'))
      const tmpFile = join(dir, 'kdtu.db')
      writeFileSync(tmpFile, '')
      process.env.KDTU_DB_FILE = tmpFile
      openDb({ dbKey: process.env.KDTU_DB_KEY })
      opened = true
    }
    expect(opened).toBe(true)
  })

  afterAll(() => closeDb())

  it('openDb returns a usable handle', () => {
    const db = getDb()
    expect(typeof db.prepare).toBe('function')
    expect(typeof db.exec).toBe('function')
    expect(db.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 })
  })

  it('schema applies and all expected tables exist', () => {
    const db = getDb()
    const rows = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    ).all()
    const names = new Set(rows.map(r => r.name))
    for (const t of EXPECTED_TABLES) {
      expect(names.has(t), `expected table ${t}`).toBe(true)
    }
  })

  it('foreign_keys pragma is ON', () => {
    const db = getDb()
    const r = db.prepare('PRAGMA foreign_keys').get()
    expect(r.foreign_keys).toBe(1)
  })

  it('members.name_enc is a BLOB that decrypts', async () => {
    const { deriveKey, encryptField, decryptField } = await import('../src/utils/crypto.js')
    const db = getDb()
    const nameEnc = encryptField('Test Person', deriveKey(process.env.KDTU_FIELD_KEY))
    db.prepare('INSERT INTO members (name_enc, pin_hash) VALUES (?, ?)').run(nameEnc, 'x')
    const row = db.prepare('SELECT name_enc FROM members ORDER BY id DESC LIMIT 1').get()
    expect(decryptField(row.name_enc, deriveKey(process.env.KDTU_FIELD_KEY))).toBe('Test Person')
  })
})