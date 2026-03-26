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
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      problem_id VARCHAR(36) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
      solved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 1,
      best_runtime INTEGER,
      best_memory INTEGER,
      PRIMARY KEY (user_id, problem_id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      external_submission_id TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      problem_id VARCHAR(36) REFERENCES problems(id) ON DELETE SET NULL,
      code TEXT NOT NULL,
      language TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      verdict TEXT,
      runtime DOUBLE PRECISION,
      memory_kb INTEGER,
      error_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
    CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_user_progress_problem_id ON user_progress(problem_id);
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
    INSERT INTO user_stats (user_id)
    SELECT id FROM users
    ON CONFLICT (user_id) DO NOTHING;
    """,
]


def run_startup_migrations(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        logger.info("Skipping Supabase/PostgreSQL bootstrap migrations for dialect=%s", engine.dialect.name)
        return

    with engine.begin() as connection:
        for statement in POSTGRES_BOOTSTRAP_SQL:
            connection.execute(text(statement))
    logger.info("Supabase bootstrap migrations applied successfully.")
