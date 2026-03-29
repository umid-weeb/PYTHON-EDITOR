from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine


logger = logging.getLogger("pyzone.arena.db_bootstrap")


POSTGRES_BOOTSTRAP_SQL = [
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS level TEXT;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS goal TEXT;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_hours TEXT;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Tashkent';
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS streak INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_solve_date DATE;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freeze INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ NOT NULL DEFAULT NOW();
    """,
    """
    CREATE TABLE IF NOT EXISTS users_backup AS
    SELECT * FROM users;
    """,
    """
    UPDATE users
    SET email = username
    WHERE username LIKE '%@%'
      AND (email IS NULL OR email = '');
    """,
    """
    UPDATE users
    SET email = LOWER(TRIM(email))
    WHERE email IS NOT NULL;
    """,
    """
    UPDATE users
    SET email = NULL
    WHERE email IS NOT NULL
      AND email NOT LIKE '%@%.%';
    """,
    """
    DELETE FROM users
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM users
      WHERE email IS NOT NULL
      GROUP BY LOWER(email)
    )
    AND email IS NOT NULL;
    """,
    """
    UPDATE users
    SET username = LEFT(
      CONCAT(
        COALESCE(
          NULLIF(
            TRIM(BOTH '_' FROM REGEXP_REPLACE(SPLIT_PART(COALESCE(email, username), '@', 1), '[^a-zA-Z0-9_]+', '_', 'g')),
            ''
          ),
          'user'
        ),
        '_',
        id::text
      ),
      50
    )
    WHERE username LIKE '%@%';
    """,
    """
    UPDATE users
    SET display_name = COALESCE(NULLIF(display_name, ''), SPLIT_PART(email, '@', 1))
    WHERE email IS NOT NULL;
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users (LOWER(email))
    WHERE email IS NOT NULL;
    """,
    """
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      solved_count INTEGER NOT NULL DEFAULT 0,
      easy_solved INTEGER NOT NULL DEFAULT 0,
      medium_solved INTEGER NOT NULL DEFAULT 0,
      hard_solved INTEGER NOT NULL DEFAULT 0,
      rating INTEGER NOT NULL DEFAULT 1200,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
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
    """,
    """
    CREATE TABLE IF NOT EXISTS solved_problems (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      problem_id VARCHAR(36) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
      solved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'submit';
    """,
    """
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS runtime_ms INTEGER;
    """,
    """
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS passed_count INTEGER;
    """,
    """
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS total_count INTEGER;
    """,
    """
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS case_results_json TEXT NOT NULL DEFAULT '[]';
    """,
    """
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    """,
    """
    ALTER TABLE submissions ALTER COLUMN user_id DROP NOT NULL;
    """,
    """
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
    """,
    """
    UPDATE submissions
    SET updated_at = COALESCE(updated_at, created_at, NOW());
    """,
    """
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
    """,
    """
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
    """,
    """
    CREATE TABLE IF NOT EXISTS streak_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      solved INTEGER NOT NULL DEFAULT 0,
      streak_day INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_streak_history_user_date UNIQUE(user_id, date)
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_streak_history_user_id ON streak_history(user_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_streak_history_date ON streak_history(date);
    """,
    """
    CREATE TABLE IF NOT EXISTS daily_challenges (
      id SERIAL PRIMARY KEY,
      problem_id VARCHAR(36) REFERENCES problems(id) ON DELETE CASCADE,
      date DATE UNIQUE NOT NULL,
      is_premium BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_daily_challenges_problem_id ON daily_challenges(problem_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_submissions_problem_id ON submissions(problem_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_submissions_user_created ON submissions(user_id, created_at DESC);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_submissions_problem_created ON submissions(problem_id, created_at DESC);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_solved_problems_user_id ON solved_problems(user_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_solved_problems_problem_id ON solved_problems(problem_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS contests (
      id VARCHAR(64) PRIMARY KEY,
      title TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      is_rated BOOLEAN NOT NULL DEFAULT FALSE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS contest_problems (
      contest_id VARCHAR(64) REFERENCES contests(id) ON DELETE CASCADE,
      problem_id VARCHAR(36) REFERENCES problems(id) ON DELETE CASCADE,
      points INTEGER NOT NULL DEFAULT 100,
      order_num INTEGER NOT NULL,
      PRIMARY KEY (contest_id, problem_id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS contest_registrations (
      contest_id VARCHAR(64) REFERENCES contests(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contest_id, user_id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS contest_submissions (
      id VARCHAR(64) PRIMARY KEY,
      contest_id VARCHAR(64) REFERENCES contests(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      problem_id VARCHAR(36) REFERENCES problems(id) ON DELETE CASCADE,
      penalty_minutes INTEGER NOT NULL DEFAULT 0,
      is_first_solve BOOLEAN NOT NULL DEFAULT FALSE,
      is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS contest_standings (
      contest_id VARCHAR(64) REFERENCES contests(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      total_solved INTEGER NOT NULL DEFAULT 0,
      total_penalty INTEGER NOT NULL DEFAULT 0,
      last_submit TIMESTAMPTZ,
      PRIMARY KEY (contest_id, user_id)
    );
    """,
    """
    ALTER TABLE contest_submissions ADD COLUMN IF NOT EXISTS submission_id TEXT;
    """,
    """
    ALTER TABLE contest_submissions ADD COLUMN IF NOT EXISTS verdict TEXT;
    """,
    """
    ALTER TABLE contest_submissions ADD COLUMN IF NOT EXISTS runtime_ms INTEGER;
    """,
    """
    ALTER TABLE contest_submissions ADD COLUMN IF NOT EXISTS memory_kb INTEGER;
    """,
    """
    ALTER TABLE contest_submissions ADD COLUMN IF NOT EXISTS penalty_minutes INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE contest_submissions ADD COLUMN IF NOT EXISTS is_first_solve BOOLEAN NOT NULL DEFAULT FALSE;
    """,
    """
    ALTER TABLE contest_submissions ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN NOT NULL DEFAULT FALSE;
    """,
    """
    ALTER TABLE contest_submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    """,
    """
    ALTER TABLE contests ADD COLUMN IF NOT EXISTS description TEXT;
    """,
    """
    ALTER TABLE contests ADD COLUMN IF NOT EXISTS is_rated BOOLEAN NOT NULL DEFAULT FALSE;
    """,
    """
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS external_submission_id TEXT;
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(120);
    """,
    """
    CREATE TABLE IF NOT EXISTS problems (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(180) UNIQUE NOT NULL,
      difficulty VARCHAR(20) NOT NULL,
      description TEXT NOT NULL,
      input_format TEXT,
      output_format TEXT,
      constraints TEXT,
      starter_code TEXT NOT NULL,
      function_name VARCHAR(64) NOT NULL DEFAULT 'solve',
      tags_json TEXT NOT NULL DEFAULT '[]',
      leetcode_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    ALTER TABLE problems ADD COLUMN IF NOT EXISTS input_format TEXT;
    """,
    """
    ALTER TABLE problems ADD COLUMN IF NOT EXISTS output_format TEXT;
    """,
    """
    ALTER TABLE problems ADD COLUMN IF NOT EXISTS constraints TEXT;
    """,
    """
    ALTER TABLE problems ADD COLUMN IF NOT EXISTS starter_code TEXT;
    """,
    """
    ALTER TABLE problems ADD COLUMN IF NOT EXISTS function_name VARCHAR(64) NOT NULL DEFAULT 'solve';
    """,
    """
    ALTER TABLE problems ADD COLUMN IF NOT EXISTS tags_json TEXT NOT NULL DEFAULT '[]';
    """,
    """
    ALTER TABLE problems ADD COLUMN IF NOT EXISTS leetcode_id INTEGER;
    """,
    """
    CREATE TABLE IF NOT EXISTS test_cases (
      id SERIAL PRIMARY KEY,
      problem_id VARCHAR(36) REFERENCES problems(id) ON DELETE CASCADE,
      input TEXT NOT NULL,
      expected_output TEXT NOT NULL,
      is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS problem_translations (
      id SERIAL PRIMARY KEY,
      problem_id VARCHAR(36) REFERENCES problems(id) ON DELETE CASCADE,
      language_code VARCHAR(5) NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      input_format TEXT,
      output_format TEXT,
      constraints TEXT,
      starter_code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS user_ratings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 1200,
      max_rating INTEGER NOT NULL DEFAULT 1200,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS rating_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      rating_after INTEGER NOT NULL,
      reason VARCHAR(120) NOT NULL DEFAULT 'submission',
      submission_id VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_rating_history_user_submission UNIQUE (user_id, submission_id)
    );
    """,
    """
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS solved_count INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS easy_solved INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS medium_solved INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS hard_solved INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 1200;
    """,
    """
    ALTER TABLE user_ratings ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 1200;
    """,
    """
    ALTER TABLE user_ratings ADD COLUMN IF NOT EXISTS max_rating INTEGER NOT NULL DEFAULT 1200;
    """,
    """
    ALTER TABLE contest_problems ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 100;
    """,
    """
    ALTER TABLE contest_problems ADD COLUMN IF NOT EXISTS order_num INTEGER NOT NULL DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ALTER COLUMN solved_count SET DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ALTER COLUMN easy_solved SET DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ALTER COLUMN medium_solved SET DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ALTER COLUMN hard_solved SET DEFAULT 0;
    """,
    """
    ALTER TABLE user_stats ALTER COLUMN rating SET DEFAULT 1200;
    """,
    """
    ALTER TABLE user_ratings ALTER COLUMN rating SET DEFAULT 1200;
    """,
    """
    ALTER TABLE user_ratings ALTER COLUMN max_rating SET DEFAULT 1200;
    """,
    """
    INSERT INTO user_stats (user_id, solved_count, easy_solved, medium_solved, hard_solved, rating)
    SELECT id, 0, 0, 0, 0, 1200 FROM users
    ON CONFLICT (user_id) DO UPDATE SET
        solved_count = COALESCE(user_stats.solved_count, 0),
        easy_solved = COALESCE(user_stats.easy_solved, 0),
        medium_solved = COALESCE(user_stats.medium_solved, 0),
        hard_solved = COALESCE(user_stats.hard_solved, 0),
        rating = COALESCE(user_stats.rating, 1200);
    """,
    """
    INSERT INTO user_ratings (user_id, rating, max_rating)
    SELECT id, 1200, 1200 FROM users
    ON CONFLICT (user_id) DO UPDATE SET
        rating = COALESCE(user_ratings.rating, 1200),
        max_rating = COALESCE(user_ratings.max_rating, 1200);
    """,
]


def run_startup_migrations(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        logger.info("Skipping Supabase/PostgreSQL bootstrap migrations for dialect=%s", engine.dialect.name)
        return

    # Execute each statement in its own transaction so one failure doesn't block others
    # and we don't crash the whole app on a timeout.
    with engine.connect() as connection:
        for i, statement in enumerate(POSTGRES_BOOTSTRAP_SQL):
            stmt_trimmed = statement.strip()
            if not stmt_trimmed:
                continue
            
            try:
                # Use a targeted transaction for this one statement
                with connection.begin():
                    connection.execute(text(statement))
            except Exception as e:
                # Log as warning - don't crash the app for bootstrap modifications
                # Often these are 'already exists' or 'timeout' on heavy tables.
                first_line = stmt_trimmed.split('\n')[0][:50]
                logger.warning(f"Bootstrap migration [{i}] failed ({first_line}...): {e}")

    logger.info("Supabase bootstrap migrations process completed (checked all steps).")
