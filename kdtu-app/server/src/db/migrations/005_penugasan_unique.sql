-- Migration 005: unique constraint on penugasan (kdl_id, title).
-- Added so the seed function's INSERT OR IGNORE actually deduplicates.
-- Created via CREATE UNIQUE INDEX IF NOT EXISTS so it is safe to re-apply.

CREATE UNIQUE INDEX IF NOT EXISTS idx_penugasan_kdl_title ON penugasan (kdl_id, title);