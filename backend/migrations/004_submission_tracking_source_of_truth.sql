-- Migration: authoritative submission tracking with solved_problems as source of truth

CREATE TABLE IF NOT EXISTS user_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    solved_count INTEGER NOT NULL DEFAULT 0,
    easy_solved INTEGER NOT NULL DEFAULT 0,
    medium_solved INTEGER NOT NULL DEFAULT 0,
    hard_solved INTEGER NOT NULL DEFAULT 0,
    rating INTEGER NOT NULL DEFAULT 1200,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    problem_id VARCHAR(36) REFERENCES problems(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    language TEXT NOT NULL,
    mode VARCHAR(10) NOT NULL DEFAULT 'submit',
    status TEXT NOT NULL DEFAULT 'pending',
    verdict TEXT,
    runtime_ms INTEGER,
    memory_kb INTEGER,
    passed_count INTEGER,
    total_count INTEGER,
    error_text TEXT,
    case_results_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'submit';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS runtime_ms INTEGER;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS passed_count INTEGER;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS total_count INTEGER;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS case_results_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE submissions ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'submissions'
          AND column_name = 'runtime'
    ) THEN
        EXECUTE '
            UPDATE submissions
            SET runtime_ms = COALESCE(runtime_ms, ROUND(runtime)::INTEGER)
            WHERE runtime_ms IS NULL
              AND runtime IS NOT NULL
        ';
    END IF;
END $$;

UPDATE submissions
SET updated_at = COALESCE(updated_at, created_at, NOW());

CREATE TABLE IF NOT EXISTS solved_problems (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id VARCHAR(36) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    solved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_solved_problems_user_problem'
    ) THEN
        ALTER TABLE solved_problems
        ADD CONSTRAINT uq_solved_problems_user_problem UNIQUE (user_id, problem_id);
    END IF;
END $$;

INSERT INTO solved_problems (user_id, problem_id, solved_at)
SELECT
    s.user_id,
    s.problem_id,
    MIN(COALESCE(s.created_at, NOW())) AS solved_at
FROM submissions s
WHERE s.user_id IS NOT NULL
  AND s.problem_id IS NOT NULL
  AND (
      LOWER(COALESCE(s.verdict, '')) = 'accepted'
      OR LOWER(COALESCE(s.status, '')) = 'accepted'
  )
GROUP BY s.user_id, s.problem_id
ON CONFLICT (user_id, problem_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_submissions_user_created ON submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_problem_created ON submissions(problem_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_solved_problems_user_id ON solved_problems(user_id);
CREATE INDEX IF NOT EXISTS idx_solved_problems_problem_id ON solved_problems(problem_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);

INSERT INTO user_stats (user_id, solved_count, easy_solved, medium_solved, hard_solved, rating, updated_at)
SELECT
    u.id,
    COALESCE(agg.solved_count, 0) AS solved_count,
    COALESCE(agg.easy_solved, 0) AS easy_solved,
    COALESCE(agg.medium_solved, 0) AS medium_solved,
    COALESCE(agg.hard_solved, 0) AS hard_solved,
    COALESCE(existing.rating, 1200) AS rating,
    NOW() AS updated_at
FROM users u
LEFT JOIN (
    SELECT
        sp.user_id,
        COUNT(*) AS solved_count,
        COUNT(*) FILTER (WHERE LOWER(p.difficulty) = 'easy') AS easy_solved,
        COUNT(*) FILTER (WHERE LOWER(p.difficulty) = 'medium') AS medium_solved,
        COUNT(*) FILTER (WHERE LOWER(p.difficulty) = 'hard') AS hard_solved
    FROM solved_problems sp
    JOIN problems p ON p.id = sp.problem_id
    GROUP BY sp.user_id
) agg ON agg.user_id = u.id
LEFT JOIN user_stats existing ON existing.user_id = u.id
ON CONFLICT (user_id) DO UPDATE
SET
    solved_count = EXCLUDED.solved_count,
    easy_solved = EXCLUDED.easy_solved,
    medium_solved = EXCLUDED.medium_solved,
    hard_solved = EXCLUDED.hard_solved,
    updated_at = NOW();
