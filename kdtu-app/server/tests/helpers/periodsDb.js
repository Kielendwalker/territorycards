// Tiny mock DB that mirrors testApp.createMockDb but adds the timetable_periods
// table. The base mock doesn't include that table because most tests don't
// touch it; this helper exists so periods.test.js can run in isolation
// without forking the entire mock schema.

import argon2 from 'argon2'

const TABLES = ['admins', 'members', 'refresh_tokens', 'audit_log', 'files', 'timetable_periods']
const AUTOINC = { admins: 0, members: 0, audit_log: 0, files: 0, timetable_periods: 0 }

// Pre-seed a handful of periods so the GET test has rows to assert against.
const SEED_PERIODS = [
  { label: 'Januari 2026', starts_on: '2026-01-01', ends_on: '2026-01-31', notes: null },
  { label: 'September 2026', starts_on: '2026-09-01', ends_on: '2026-09-30', notes: null },
]

export function buildMockDbWithPeriods () {
  const tables = Object.fromEntries(TABLES.map(t => [t, []]))
  const autoInc = { ...AUTOINC }
  let seedPeriodId = 0

  function nextId (table) {
    autoInc[table] += 1
    return autoInc[table]
  }

  function prepare (sql) {
    const trimmed = sql.trim()
    const upper = trimmed.toUpperCase()

    return {
      get (...params) { return this._get(...params) },
      all (...params) { return this._all(...params) },
      run (...params) { return this._run(...params) },
      _get (...params) {
        if (/FROM\s+ADMINS/i.test(trimmed)) {
          if (/WHERE\s+USERNAME\s*=\s*\?/i.test(trimmed)) {
            return tables.admins.find(a => a.username === params[0])
          }
        }
        if (/FROM\s+TIMETABLE_PERIODS/i.test(trimmed)) {
          if (/WHERE\s+ID\s*=\s*\?/i.test(trimmed)) {
            return tables.timetable_periods.find(p => p.id === params[0])
          }
          if (/WHERE\s+LABEL\s*=\s*\?/i.test(trimmed)) {
            return tables.timetable_periods.find(p => p.label === params[0])
          }
          if (/WHERE\s+LABEL\s*=\s*\?\s+AND\s+ID\s*<>\s*\?/i.test(trimmed)) {
            return tables.timetable_periods.find(p => p.label === params[0] && p.id !== params[1])
          }
        }
        return undefined
      },
      _all (...params) {
        if (/FROM\s+TIMETABLE_PERIODS/i.test(trimmed)) {
          return [...tables.timetable_periods].sort((a, b) =>
            a.starts_on < b.starts_on ? 1 : a.starts_on > b.starts_on ? -1 : 0
          )
        }
        return []
      },
      _run (...params) {
        if (upper.startsWith('INSERT INTO ADMINS')) {
          const id = nextId('admins')
          tables.admins.push({
            id, username: params[0], password_hash: params[1], display_name: params[2],
            must_change_password: params[3] ?? 0,
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('INSERT INTO TIMETABLE_PERIODS')) {
          const id = nextId('timetable_periods')
          tables.timetable_periods.push({
            id, label: params[0], starts_on: params[1], ends_on: params[2], notes: params[3] ?? null,
          })
          return { changes: 1, lastInsertRowid: id }
        }
        if (upper.startsWith('UPDATE TIMETABLE_PERIODS')) {
          const id = params[params.length - 1]
          const row = tables.timetable_periods.find(p => p.id === id)
          if (!row) return { changes: 0 }
          row.label = params[0]
          row.starts_on = params[1]
          row.ends_on = params[2]
          row.notes = params[3]
          return { changes: 1 }
        }
        if (upper.startsWith('DELETE FROM TIMETABLE_PERIODS')) {
          const before = tables.timetable_periods.length
          const id = params[0]
          tables.timetable_periods = tables.timetable_periods.filter(p => p.id !== id)
          return { changes: before - tables.timetable_periods.length }
        }
        if (upper.startsWith('INSERT INTO AUDIT_LOG')) {
          const id = nextId('audit_log')
          tables.audit_log.push({
            id, actor: params[0], action: params[1], resource: params[2],
            details: params[3], created_at: params[4],
          })
          return { changes: 1, lastInsertRowid: id }
        }
        return { changes: 0 }
      },
    }
  }

  function exec (_sql) { /* no-op */ }
  function transaction (fn) { return (...args) => fn(...args) }
  function close () {}
  function pragma () {}

  async function seedAdmin () {
    const hash = await argon2.hash('correct-horse-battery-staple', { type: argon2.argon2id })
    tables.admins.push({
      id: 1, username: 'admin', password_hash: hash, display_name: 'admin', must_change_password: 0,
    })
    for (const p of SEED_PERIODS) {
      seedPeriodId += 1
      tables.timetable_periods.push({ id: seedPeriodId, ...p })
    }
    autoInc.admins = 1
    autoInc.timetable_periods = seedPeriodId
  }

  return { prepare, exec, transaction, close, pragma, seedAdmin, _tables: tables }
}
