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
| kdtu-admin | `koordinator_srengseng3` | printed once by `npm run server:seed` |
| kdtu | member name + 4-digit PIN (seeded from xlsx) |

The seed script generates a **random** 32-character admin password and prints it
once on stdout. The admin row is flagged `must_change_password = 1`; every
protected endpoint (including `GET /api/auth/me`) returns
`403 PASSWORD_RESET_REQUIRED` until the admin rotates via
`POST /api/auth/change-password`. Copy the password from the seed output
immediately — it is not stored in plaintext and will not be reprinted.

## Security notes

- Database file is SQLCipher-encrypted at rest (`PRAGMA key='…'`). The passphrase is
  loaded from `KDTU_DB_KEY` (env) or `server/.env`.
- Sensitive columns (member full name + phone, admin password hash) additionally use
  application-level AES-256-GCM with a key derived from `KDTU_FIELD_KEY`.
- Tokens are JWT HS256 with 15-minute lifetime, refresh via `/api/auth/refresh`.
- Rate limit: `express-rate-limit` 100 req / 15 min default, 5 / 15 min on `/login`.
- First-login guard: seeded admin must rotate the credential before any
  protected route returns a 200 (403 PASSWORD_RESET_REQUIRED otherwise). The
  `must_change_password` flag can also be set by an operator to force a reset.

## Deployment

The application is split between two hosts:

| Surface  | Host   | Why                                                                                       |
|----------|--------|--------------------------------------------------------------------------------------------|
| `kdtu` + `kdtu-admin` front-ends (Vue 3 SPAs) | **Vercel** | Static build, cheap, edge CDN, automatic HTTPS. |
| Express API + SQLCipher DB + `kdtu-data/` assets | **Render** (or Fly.io) | Needs a persistent disk for the encrypted database and uploaded spreadsheets/images. Vercel serverless functions are ephemeral and cannot host SQLCipher. |

### Front-ends on Vercel

1. Import the GitHub repo at <https://vercel.com/new>.
2. Set **Root Directory** = `kdtu-app/kdtu-admin` for the admin app and
   `kdtu-app/kdtu` for the member app. (Or use the existing `vercel.json`
   which configures `kdtu-admin` as a project.)
3. Override the API base URL by setting `VITE_API_BASE` (or proxy `/api` from
   the front-end to the Render host via a `rewrites` entry + a Vercel rewrite
   rule). The simplest setup: configure both front-ends to call `/api/...`
   directly and add a Vercel rewrite that 307s `/api/*` to the Render host —
   this keeps CORS simple because the browser still sees a same-origin URL.
4. Build command is `npm run build` (vite); output directory is `dist`.

### API on Render

`render.yaml` is checked in. Render reads it as a Blueprint and provisions the
`kdtu-api` web service with a 1 GB persistent disk mounted at `/var/data`.

Required env (set on the Render dashboard or via `render env:set`):

| Variable           | Notes                                                                    |
|--------------------|--------------------------------------------------------------------------|
| `KDTU_DB_KEY`      | ≥ 32-char SQLCipher passphrase. **Never commit.** |
| `KDTU_FIELD_KEY`   | ≥ 32-char key for AES-256-GCM field encryption. **Never commit.** |
| `KDTU_JWT_SECRET`  | ≥ 32-char HS256 secret. **Never commit.** |
| `KDTU_DB_FILE`     | `/var/data/kdtu.db` (mounted disk). |
| `KDTU_DATA_DIR`    | `/var/data/kdtu-data` (uploaded spreadsheets + images). |
| `KDTU_ALLOWED_ORIGINS` | Comma-separated list of front-end origins (the Vercel URLs). |
| `NODE_ENV`         | `production`. |
| `PORT`             | Render injects this; the server already reads it. |

After the first deploy:

1. SSH in via the Render shell and run `npm run server:seed` once to mint the
   initial admin user. Copy the printed password — it is shown only once.
2. Upload the contents of `kdtu-data/` (or new spreadsheets/images) into
   `/var/data/kdtu-data/` on the disk. The next process restart will re-index
   them into the `files` table. (Or call a future `POST /api/files/reindex`
   once that endpoint exists.)
3. Log into the admin front-end, rotate the password, upload the rest of the
   members + KDL + publication data.

### Fly.io alternative

The same `server/` workspace builds into a Docker image (`Dockerfile` is not
checked in yet — run `fly launch` once, accept the generated Dockerfile). A
Fly persistent volume mounted at `/var/data` substitutes for the Render disk;
the env vars above map 1:1. Choose a Singapore or Jakarta region to keep
latency low for Indonesian operators.
