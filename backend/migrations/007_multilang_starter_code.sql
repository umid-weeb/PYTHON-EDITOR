-- 007_multilang_starter_code.sql
-- LeetCode-style per-language starter code.
-- Idempotent: safe to run multiple times. Also applied at startup by db_bootstrap.

-- Language-agnostic signature spec (source of truth for generated stubs):
--   {"function_name": str, "params": [{"name","type"}], "returns": {"type"}}
ALTER TABLE problems ADD COLUMN IF NOT EXISTS signature_json TEXT;

-- Per-(problem, programming-language) starter stub.
-- Generated from signature_json; is_custom protects manual overrides.
CREATE TABLE IF NOT EXISTS problem_starter_codes (
    id         BIGSERIAL PRIMARY KEY,
    problem_id VARCHAR(36) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    language   VARCHAR(20) NOT NULL,
    code       TEXT NOT NULL,
    is_custom  BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_problem_starter_lang UNIQUE (problem_id, language)
);
-- The UNIQUE(problem_id, language) index already serves the only access path
-- (fetch every language for one problem), so no extra index is needed.
