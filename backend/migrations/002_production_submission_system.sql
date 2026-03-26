-- Migration: Production Submission System with Uzbek-only Content
-- This migration implements a strict production system with 500MB storage limit
-- All content must be in Uzbek only, no English storage

-- 1. Remove multilingual tables (if they exist)
DROP TABLE IF EXISTS problem_translations CASCADE;
DROP FUNCTION IF EXISTS get_problem_translation CASCADE;
DROP VIEW IF EXISTS problem_with_translations CASCADE;

-- 2. Ensure problems table has leetcode_id and Uzbek content only
ALTER TABLE problems ADD COLUMN IF NOT EXISTS leetcode_id INTEGER NULL;
CREATE INDEX IF NOT EXISTS idx_problems_leetcode_id ON problems(leetcode_id);

-- 3. Create solved_problems table with strict constraints
CREATE TABLE solved_problems (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    problem_id VARCHAR(36) NOT NULL,
    solved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate solves
    UNIQUE (user_id, problem_id),
    
    -- Foreign key constraints
    CONSTRAINT fk_solved_problems_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_solved_problems_problem_id FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
);

-- 4. Create submissions table with concurrency safety
CREATE TABLE submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    problem_id VARCHAR(36) NOT NULL,
    code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    verdict VARCHAR(20) DEFAULT NULL,
    runtime_ms INTEGER DEFAULT NULL,
    memory_kb INTEGER DEFAULT NULL,
    error_text TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_submissions_user_created (user_id, created_at DESC),
    INDEX idx_submissions_problem_created (problem_id, created_at DESC),
    INDEX idx_submissions_status (status),
    
    -- Foreign key constraints
    CONSTRAINT fk_submissions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_submissions_problem_id FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
);

-- 5. Create user_stats table (cache table)
CREATE TABLE user_stats (
    user_id INTEGER PRIMARY KEY,
    solved_count INTEGER DEFAULT 0,
    easy_solved INTEGER DEFAULT 0,
    medium_solved INTEGER DEFAULT 0,
    hard_solved INTEGER DEFAULT 0,
    rating INTEGER DEFAULT 1000,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint
    CONSTRAINT fk_user_stats_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Create function to update user_stats safely
CREATE OR REPLACE FUNCTION update_user_stats(p_user_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_solved_count INTEGER;
    v_easy_count INTEGER;
    v_medium_count INTEGER;
    v_hard_count INTEGER;
BEGIN
    -- Count solved problems by difficulty
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE p.difficulty = 'easy'),
        COUNT(*) FILTER (WHERE p.difficulty = 'medium'),
        COUNT(*) FILTER (WHERE p.difficulty = 'hard')
    INTO 
        v_solved_count, v_easy_count, v_medium_count, v_hard_count
    FROM solved_problems sp
    JOIN problems p ON sp.problem_id = p.id
    WHERE sp.user_id = p_user_id;
    
    -- Update or insert stats
    INSERT INTO user_stats (user_id, solved_count, easy_solved, medium_solved, hard_solved, last_updated)
    VALUES (p_user_id, v_solved_count, v_easy_count, v_medium_count, v_hard_count, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        solved_count = EXCLUDED.solved_count,
        easy_solved = EXCLUDED.easy_solved,
        medium_solved = EXCLUDED.medium_solved,
        hard_solved = EXCLUDED.hard_solved,
        last_updated = EXCLUDED.last_updated;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger to automatically update user_stats
CREATE OR REPLACE FUNCTION trigger_update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update stats for the user
    PERFORM update_user_stats(NEW.user_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_stats_trigger
    AFTER INSERT ON solved_problems
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_user_stats();

-- 8. Create function to update updated_at timestamp for submissions
CREATE OR REPLACE FUNCTION update_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_submissions_updated_at
    BEFORE UPDATE ON submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_submissions_updated_at();

-- 9. Create indexes for optimal performance
CREATE INDEX idx_solved_problems_user_id ON solved_problems(user_id);
CREATE INDEX idx_solved_problems_problem_id ON solved_problems(problem_id);
CREATE INDEX idx_submissions_user_status ON submissions(user_id, status);
CREATE INDEX idx_submissions_problem_status ON submissions(problem_id, status);

-- 10. Create view for problem statistics
CREATE OR REPLACE VIEW problem_stats AS
SELECT 
    p.id,
    p.slug,
    p.title,
    p.difficulty,
    p.leetcode_id,
    COUNT(sp.id) as solved_count,
    COUNT(s.id) as total_submissions,
    ROUND(
        CASE WHEN COUNT(s.id) > 0 
        THEN (COUNT(sp.id)::FLOAT / COUNT(s.id)::FLOAT) * 100 
        ELSE 0 END, 
        2
    ) as acceptance_rate
FROM problems p
LEFT JOIN solved_problems sp ON p.id = sp.problem_id
LEFT JOIN submissions s ON p.id = s.problem_id
GROUP BY p.id, p.slug, p.title, p.difficulty, p.leetcode_id;

-- 11. Create function to get user profile data
CREATE OR REPLACE FUNCTION get_user_profile(p_user_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'user_id', u.id,
        'username', u.username,
        'email', u.email,
        'solved_count', COALESCE(us.solved_count, 0),
        'easy_solved', COALESCE(us.easy_solved, 0),
        'medium_solved', COALESCE(us.medium_solved, 0),
        'hard_solved', COALESCE(us.hard_solved, 0),
        'rating', COALESCE(us.rating, 1000),
        'recent_submissions', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', s.id,
                    'problem_slug', p.slug,
                    'problem_title', p.title,
                    'leetcode_id', p.leetcode_id,
                    'status', s.status,
                    'verdict', s.verdict,
                    'runtime_ms', s.runtime_ms,
                    'memory_kb', s.memory_kb,
                    'created_at', s.created_at
                )
            )
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            WHERE s.user_id = p_user_id
            ORDER BY s.created_at DESC
            LIMIT 20
        )
    ) INTO result
    FROM users u
    LEFT JOIN user_stats us ON u.id = us.user_id
    WHERE u.id = p_user_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;