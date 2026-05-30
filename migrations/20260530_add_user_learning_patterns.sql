-- Migration: Add user_learning_patterns table
-- Created: 2026-05-30

CREATE TABLE IF NOT EXISTS user_learning_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(64) NOT NULL CHECK (topic IN ('binary_search','trees','linked_list','bfs','dfs')),
  fail_count INT NOT NULL DEFAULT 0,
  mastery_score INT NOT NULL DEFAULT 0 CHECK (mastery_score >= 0 AND mastery_score <= 100),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate tracking per user/topic
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_topic ON user_learning_patterns (user_id, topic);
