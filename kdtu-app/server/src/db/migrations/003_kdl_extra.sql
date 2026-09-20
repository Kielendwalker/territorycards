-- Migration 003: KDL extra columns.
-- Added by sub-agent B (KDL feature) to mirror the columns visible in the
-- photographed notice board for "Sidang Jakarta Srengseng":
--   meeting_time  TEXT   -- e.g. '15:00'
--   location      TEXT   -- e.g. 'Rumah Sdri. Zelza'
--   announcements TEXT   -- free-form text (e.g. 'Pinjam ruang sidang tgl ...')
--
-- All nullable so the schema stays backward compatible (existing kdl rows
-- created from schema.sql have only id/name/leader/meeting_day).

ALTER TABLE kdl ADD COLUMN meeting_time  TEXT;
ALTER TABLE kdl ADD COLUMN location      TEXT;
ALTER TABLE kdl ADD COLUMN announcements TEXT;
