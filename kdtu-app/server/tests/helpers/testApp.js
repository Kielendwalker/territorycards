// Test helper: build an in-memory JS DB mock + Express app.
//
// The mock mirrors what production needs from server/src/db/schema.sql for the
// auth surface:
//   admins(id, username UNIQUE, password_hash, display_name)
//   members(id, name_enc BLOB, pin_hash, active)
//   refresh_tokens(jti PK, user_id, role, token_hash UNIQUE,
//                  expires_at, revoked_at, created_at)
//   audit_log(id, actor, action, resource, details, created_at)
//
// Member names are stored as AES-GCM ciphertext via utils/crypto.js so that
// `findMemberByName` can decrypt-match. When sub-agent F's openDb() lands,
// tests can swap in the real handle and drop this helper.

import argon2 from 'argon2'
import { createApp } from '../../src/index.js'
import { ROLE } from '@kdtu/shared'
import { encryptField, deriveKey } from '../../src/utils/crypto.js'

const SCHEMA_TABLES = ['admins', 'members', 'refresh_tokens', 'audit_log']

function createMockDb () {
  const tables = Object.fromEntries(SCHEMA_TABLES.map(t => [t, []]))
  const autoInc = { admins: 0, members: 0, audit_log: 0 }

  function splitStatements (sql) {
    return sql.split(/;\s*\n?/).map(s => s.trim()).filter(Boolean)
  }

  function nextId (table) {
    if (!(table in autoInc)) throw new Error(`no autoinc for ${table}`)
    autoInc[table] += 1
    return autoInc[table]
  }

  function exec (sql) {
    // No-op for CREATE statements. Mock starts with empty tables.
  }

  function prepare (sql) {
    const trimmed = sql.trim()
    const upper = trimmed.toUpperCase()

    return {
      get (...params) {
        if (this.all && arguments.length === 0) {
          // disambiguate: never used, but keeps callers safe
        }
        return this._get(...params)
      },
      all (...params) {
        return this._all(...params)
      },
      _get (...params) {
        if (/FROM\s+ADMINS/i.test(trimmed)) {
          if (/WHERE\s+USERNAME\s*=\s*\?/i.test(trimmed)) {
            return tables.admins.find(a => a.username === params[0])
          }
          if (/WHERE\s+ID\s*=\s*\?/i.test(trimmed)) {
            return tables.admins.find(a => a.id === params[0])
          }
        }
        if (/FROM\s+MEMBERS/i.test(trimmed)) {
          if (/WHERE\s+ID\s*=\s*\?/i.test(trimmed)) {
            return tables.members.find(m => m.id === params[0])
          }
          if (/WHERE\s+ACTIVE\s*=\s*1/i.test(trimmed)) {
            return tables.members.filter(m => m.active === 1)
          }
        }
        if (/FROM\s+REFRESH_TOKENS/i.test(trimmed)) {
          if (/WHERE\s+TOKEN_HASH\s*=\s*\?/i.test(trimmed)) {
            return tables.refresh_tokens.find(r => r.token_hash === params[0])
          }
        }
        return undefined
      },
      run (...params) {
        return this._run(...params)
      },
      _run (...params) {
        if (upper.startsWith('INSERT INTO ADMINS')) {
          const id = nextId('admins')
          tables.admins.push({ id, username: params[0], password_hash: params[1], display_name: params[2] })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO MEMBERS')) {
          const id = nextId('members')
          tables.members.push({
            id,
            name_enc: params[0],
            pin_hash: params[1],
            active: params[2] === undefined ? 1 : params[2],
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO REFRESH_TOKENS')) {
          tables.refresh_tokens.push({
            jti: params[0],
            user_id: params[1],
            role: params[2],
            token_hash: params[3],
            expires_at: params[4],
            revoked_at: null,
          })
          return { changes: 1 }
        }
        if (upper.startsWith('INSERT INTO AUDIT_LOG')) {
          const id = nextId('audit_log')
          tables.audit_log.push({
            id, actor: params[0], action: params[1], resource: params[2],
            details: params[3], created_at: params[4],
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('UPDATE REFRESH_TOKENS')) {
          let changes = 0
          if (/WHERE\s+JTI\s*=\s*\?/i.test(trimmed)) {
            const jti = params[1], ts = params[0]
            for (const r of tables.refresh_tokens) if (r.jti === jti && !r.revoked_at) { r.revoked_at = ts; changes += 1 }
          } else if (/WHERE\s+TOKEN_HASH\s*=\s*\?/i.test(trimmed)) {
            const h = params[1], ts = params[0]
            for (const r of tables.refresh_tokens) if (r.token_hash === h && !r.revoked_at) { r.revoked_at = ts; changes += 1 }
          } else if (/WHERE\s+USER_ID\s*=\s*\?/i.test(trimmed)) {
            const uid = params[1], ts = params[0]
            for (const r of tables.refresh_tokens) if (r.user_id === uid && !r.revoked_at) { r.revoked_at = ts; changes += 1 }
          }
          return { changes }
        }
        if (upper.startsWith('UPDATE ADMINS')) {
          // UPDATE admins SET password_hash = ? WHERE id = ?
          const id = params[1], h = params[0]
          for (const a of tables.admins) if (a.id === id) { a.password_hash = h; return { changes: 1 } }
          return { changes: 0 }
        }
        throw new Error(`mock db: unhandled run(): ${trimmed}`)
      },
      _all (...params) {
        if (/FROM\s+MEMBERS/i.test(trimmed) && /WHERE\s+ACTIVE\s*=\s*1/i.test(trimmed)) {
          return tables.members.filter(m => m.active === 1)
        }
        if (/FROM\s+ADMINS/i.test(trimmed) && /WHERE\s+ID\s*=\s*\?/i.test(trimmed)) {
          const r = tables.admins.filter(a => a.id === params[0])
          return r
        }
        return []
      },
    }
  }

  function transaction (fn) {
    return (...args) => fn(...args)
  }
  function close () {}
  function pragma () {}

  return { prepare, exec, transaction, close, pragma, _tables: tables }
}

export async function buildTestApp ({ seed = {} } = {}) {
  process.env.KDTU_JWT_SECRET = 'test-secret-test-secret-test-secret-1234'
  // >= 32 char field key is required by the encryption helpers for member name lookup.
  process.env.KDTU_FIELD_KEY  = 'test-field-key-test-field-key-test-field-AB'
  process.env.NODE_ENV = 'test'

  const db = createMockDb()
  const admin = seed.admin || { username: 'admin', password: 'correct-horse-battery-staple', display_name: 'admin' }
  const member = seed.member || { name: 'Alice', pin: '1234' }

  const fieldKey = deriveKey(process.env.KDTU_FIELD_KEY)
  const adminHash = await argon2.hash(admin.password, { type: argon2.argon2id })
  const memberPinHash = await argon2.hash(member.pin, { type: argon2.argon2id })
  const memberNameEnc = encryptField(member.name, fieldKey)

  db.prepare('INSERT INTO admins (username, password_hash, display_name) VALUES (?, ?, ?)').run(admin.username, adminHash, admin.display_name)
  db.prepare('INSERT INTO members (name_enc, pin_hash) VALUES (?, ?)').run(memberNameEnc, memberPinHash)

  const app = createApp({ db })
  return { app, db, credentials: { admin, member } }
}
