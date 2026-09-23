PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  -- must_change_password = 1 means the seeded (or reset) password is still in
  -- use and the admin must rotate it before reaching any protected route.
  -- The auth router rejects requests with a 403 PASSWORD_RESET_REQUIRED until
  -- POST /api/auth/change-password clears the flag.
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1))
);

CREATE TABLE IF NOT EXISTS members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name_enc        BLOB NOT NULL,
  phone_enc       BLOB,
  pin_hash        TEXT NOT NULL,
  kdl_id          INTEGER REFERENCES kdl(id) ON DELETE SET NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  availability    TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('JAGA','RAK_STAND'))
);

CREATE TABLE IF NOT EXISTS timetable_periods (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  label     TEXT NOT NULL UNIQUE,
  starts_on TEXT NOT NULL,
  ends_on   TEXT NOT NULL,
  notes     TEXT
);

CREATE TABLE IF NOT EXISTS timetable_assignments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id         INTEGER NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  day               TEXT NOT NULL CHECK(day IN ('RABU','JUMAT','SABTU','MINGGU')),
  slot              TEXT NOT NULL CHECK(slot IN ('EARLY','LATE')),
  jam               TEXT NOT NULL,
  date              TEXT NOT NULL,
  lokasi_jaga       TEXT NOT NULL,
  lokasi_rak_beroda TEXT,
  poster_rak_beroda TEXT,
  set_rakrod        TEXT
);

CREATE TABLE IF NOT EXISTS timetable_assignment_members (
  assignment_id INTEGER NOT NULL REFERENCES timetable_assignments(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (assignment_id, member_id)
);

CREATE TABLE IF NOT EXISTS kdl (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  leader      TEXT,
  meeting_day TEXT
);

CREATE TABLE IF NOT EXISTS penugasan (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kdl_id      INTEGER NOT NULL REFERENCES kdl(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_on      TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING'
                CHECK(status IN ('PENDING','IN_PROGRESS','DONE'))
);

CREATE TABLE IF NOT EXISTS publications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL
                CHECK(category IN ('Majalah','Risalah','Buku','Brosur','Lainnya')),
  title       TEXT NOT NULL,
  edition     TEXT,
  stock       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(category, title, edition)
);

CREATE TABLE IF NOT EXISTS timetable_publications (
  period_id     INTEGER NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (period_id, publication_id)
);

CREATE TABLE IF NOT EXISTS kdtu_summary_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id    INTEGER NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  bulan        TEXT NOT NULL,
  location     TEXT NOT NULL,
  sesi         TEXT NOT NULL,
  category     TEXT NOT NULL,
  title        TEXT NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  resource  TEXT NOT NULL,
  details   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assign_period_date ON timetable_assignments(period_id, date);
CREATE INDEX IF NOT EXISTS idx_summary_period ON kdtu_summary_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_member_kdl ON members(kdl_id);

-- refresh_tokens — SHA-256-hashed refresh JWTs. Added by sub-agent G (auth) so
-- that the auth router can detect replayed refresh tokens and revoke an entire
-- token family in one UPDATE. The router only stores the SHA-256 hash, never
-- the raw JWT.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti          TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin','member')),
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);

-- files — metadata for downloadable assets under kdtu-data/ (xlsx + images).
-- Populated by scanKdtuDataDir() at API boot. The filesystem path is never
-- exposed to clients; downloads go through /api/files/:id/download which
-- resolves the path server-side with realpath() and a directory-prefix check.
CREATE TABLE IF NOT EXISTS files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK(kind IN ('spreadsheet', 'image', 'document')),
  size_bytes  INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_kind ON files (kind);
