# KDTU Application (kdtu-app)

Sub-domain app for the **KDTU SIDANG SRENGSENG-3** service schedule, paired with
**KDL (Kelompok Pelayanan)** data and a publications catalogue. Two Vue 3 front-ends
share one Node.js + Express + SQLCipher-encrypted SQLite API.

```
kdtu-app/
├── server/         Express API + SQLCipher-encrypted SQLite database
├── kdtu/           Public-facing member app (PIN login, "where am I today?")
├── kdtu-admin/     Admin app (username + password, full CRUD)
└── shared/         Shared API contracts, types, constants
```

## Domain model

| Sub-domain | Audience | Auth |
|------------|----------|------|
| `kdtu`     | KDTU members | 4-digit PIN per member |
| `kdtu-admin` | Coordinator / Admin | Username + password (argon2id) |

## Features

1. KDTU timetable (Sep 2026 + future periods) with member-availability picker,
   LOKASI RAK BERODA / STAND, POSTER, SET RAKROD.
2. KDL (Kelompok Pelayanan) master data with members per KDL.
3. Assignable Penugasan items per KDL.
4. KDTU Summary view (Majalah / Risalah / Buku / Brosur / Lainnya).
5. Publications catalogue that supports KDTU timetable (Majalah, Risalah, Buku, Brosur).
6. SQLCipher-encrypted SQLite, AES-256-GCM envelope encryption for sensitive fields.
7. Argon2id admin passwords, JWT (HS256, short-lived), per-IP rate limiting,
   Helmet, CSP, CORS allow-list, audit log.
8. Vitest unit tests for each sub-domain and the API.
9. Modern professional UI with confirm-popups on every add / edit / delete.

## Run locally

```bash
# 1. install everything
npm install

# 2. seed the SQLCipher database from the existing .xlsx sources
npm run server:seed

# 3. start API + both front-ends
npm run dev
```

Default seeded credentials:

| App | Login | Password / PIN |
|-----|-------|----------------|
| kdtu-admin | `admin` | `admin12345` (change after first login) |
| kdtu | member name + 4-digit PIN (seeded from xlsx) |

## Security notes

- Database file is SQLCipher-encrypted at rest (`PRAGMA key='…'`). The passphrase is
  loaded from `KDTU_DB_KEY` (env) or `server/.env`.
- Sensitive columns (member full name + phone, admin password hash) additionally use
  application-level AES-256-GCM with a key derived from `KDTU_FIELD_KEY`.
- Tokens are JWT HS256 with 15-minute lifetime, refresh via `/api/auth/refresh`.
- Rate limit: `express-rate-limit` 100 req / 15 min default, 5 / 15 min on `/login`.
