-- Migration 004: penugasan.completed_at
-- Added by sub-agent C (penugasan feature) so that POST /api/penugasan/:id/complete
-- can record the moment a Penugasan item is marked DONE. Nullable so existing rows
-- remain valid (NULL means "not yet completed").

ALTER TABLE penugasan ADD COLUMN completed_at TEXT;