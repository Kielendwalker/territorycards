process.env.KDTU_DB_KEY='test-db-key-must-be-at-least-32-characters-long-AA';
process.env.KDTU_FIELD_KEY='test-field-key-must-be-at-least-32-characters-long-BB';
process.env.KDTU_JWT_SECRET='test-jwt-secret-must-be-at-least-32-chars-long-CCCC';

import argon2 from 'argon2';
import request from 'supertest';

// Inline minimal mock — copy from test
const tables = { admins: [], kdtu_summary_entries: [], timetable_periods: [], audit_log: [], members: [], refresh_tokens: [] };
const autoInc = { admins: 0, members: 0, audit_log: 0, timetable_periods: 0, kdtu_summary_entries: 0 };
function nextId(t) { autoInc[t] += 1; return autoInc[t]; }

const db = {
  prepare(sql) {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();
    return {
      get(...p) {
        if (/FROM\s+ADMINS/i.test(trimmed) && /WHERE\s+USERNAME/i.test(upper)) {
          return tables.admins.find(a => a.username === p[0]);
        }
        if (/FROM\s+KDTU_SUMMARY_ENTRIES/i.test(trimmed) && /WHERE\s+ID/i.test(upper)) {
          return tables.kdtu_summary_entries.find(e => e.id === p[0]);
        }
        if (/FROM\s+TIMETABLE_PERIODS/i.test(trimmed) && /WHERE\s+ID/i.test(upper)) {
          return tables.timetable_periods.find(p => p.id === p[0]);
        }
        return undefined;
      },
      run(...p) {
        if (upper.startsWith('INSERT INTO ADMINS')) {
          const id = nextId('admins');
          tables.admins.push({ id, username: p[0], password_hash: p[1], display_name: p[2] });
          return { changes: 1, lastInsertRowid: id };
        }
        if (upper.startsWith('INSERT INTO TIMETABLE_PERIODS')) {
          const id = nextId('timetable_periods');
          tables.timetable_periods.push({ id, label: p[0], starts_on: p[1], ends_on: p[2] });
          return { changes: 1, lastInsertRowid: id };
        }
        if (upper.startsWith('INSERT INTO KDTU_SUMMARY_ENTRIES')) {
          const id = nextId('kdtu_summary_entries');
          tables.kdtu_summary_entries.push({ id, period_id: p[0], bulan: p[1], location: p[2], sesi: p[3], category: p[4], title: p[5], quantity: p[6] });
          return { changes: 1, lastInsertRowid: id };
        }
        if (upper.startsWith('INSERT INTO REFRESH_TOKENS')) {
          tables.refresh_tokens.push({ jti: p[0], user_id: p[1], role: p[2], token_hash: p[3], expires_at: p[4], revoked_at: null });
          return { changes: 1 };
        }
        if (upper.startsWith('INSERT INTO AUDIT_LOG')) {
          const id = nextId('audit_log');
          tables.audit_log.push({ id, actor: p[0], action: p[1], resource: p[2], details: p[3], created_at: p[4] });
          return { changes: 1, lastInsertRowid: id };
        }
        if (upper.startsWith('UPDATE KDTU_SUMMARY_ENTRIES')) {
          const id = p[p.length - 1];
          const entry = tables.kdtu_summary_entries.find(e => e.id === id);
          if (!entry) return { changes: 0 };
          entry.period_id = p[0]; entry.bulan = p[1]; entry.location = p[2]; entry.sesi = p[3];
          entry.category = p[4]; entry.title = p[5]; entry.quantity = p[6];
          return { changes: 1 };
        }
        if (upper.startsWith('UPDATE REFRESH_TOKENS')) {
          return { changes: 0 };
        }
        throw new Error('UNHANDLED: ' + trimmed);
      },
      all(...p) { return []; }
    };
  },
  exec() {}, transaction: (f) => (...a) => f(...a), close() {}, pragma() {}
};

const hash = await argon2.hash('correct-horse-battery-staple', { type: argon2.argon2id });
db.prepare('INSERT INTO admins (username, password_hash, display_name) VALUES (?, ?, ?)').run('admin', hash, 'admin');
db.prepare('INSERT INTO timetable_periods (label, starts_on, ends_on) VALUES (?, ?, ?)').run('2026', '2026-01-01', '2026-12-31');

const { createApp } = await import('./src/index.js');
const { createSummaryRouter } = await import('./src/routes/summary.js');
const app = createApp({ db });
app.use('/api', createSummaryRouter());

const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'correct-horse-battery-staple' });
const token = login.body.accessToken;

const created = await request(app).post('/api/summary/kdtu')
  .set('Authorization', `Bearer ${token}`)
  .send({ periodId: 1, bulan: '2026-09', location: 'L', sesi: 'S', category: 'Buku', title: 'Original', quantity: 3 });
console.log('CREATED:', created.status, created.body);

const upd = await request(app).put(`/api/summary/kdtu/${created.body.id}`)
  .set('Authorization', `Bearer ${token}`)
  .send({ quantity: 10 });
console.log('UPDATED:', upd.status, upd.body);
