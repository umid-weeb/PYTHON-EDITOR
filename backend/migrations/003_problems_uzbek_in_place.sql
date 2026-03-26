-- Migration: Prepare problems table for in-place Uzbek-only content migration
-- This migration is intentionally limited to backup + additive schema changes.
-- The content rewrite itself is executed by scripts/migrate_problems_to_uzbek.py.

DO $$
BEGIN
    IF to_regclass('public.problems_backup') IS NULL THEN
        EXECUTE 'CREATE TABLE problems_backup AS SELECT * FROM problems';
    END IF;
END $$;

ALTER TABLE problems ADD COLUMN IF NOT EXISTS leetcode_id INTEGER;
ALTER TABLE problems ADD COLUMN IF NOT EXISTS title_uz TEXT;
ALTER TABLE problems ADD COLUMN IF NOT EXISTS description_uz TEXT;

CREATE INDEX IF NOT EXISTS idx_problems_leetcode_id ON problems (leetcode_id);
