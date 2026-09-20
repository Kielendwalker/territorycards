-- Migration 006: add admins.must_change_password.
--
-- Forces the first admin login (after a fresh seed or an explicit reset) to
-- rotate the credential before reaching any protected route. The auth router
-- returns 403 PASSWORD_RESET_REQUIRED until the flag is cleared via
-- POST /api/auth/change-password.
--
-- Safe to re-apply: ADD COLUMN uses IF NOT EXISTS via a runtime check in
-- migrate.js (better-sqlite3-multiple-ciphers supports it via try/catch).
ALTER TABLE admins ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0
  CHECK(must_change_password IN (0,1));

-- Backfill: any existing admin row whose password is unchanged since the seed
-- is treated as needing rotation. Operators can clear the flag manually after
-- they've rotated their own password.
UPDATE admins SET must_change_password = 1
 WHERE created_at = last_login_at OR last_login_at IS NULL;