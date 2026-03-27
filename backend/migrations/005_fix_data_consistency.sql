-- Migration: Fix Data Consistency Issues
-- This migration fixes the critical data inconsistency bugs in the submission system

-- 1. Add debugging column to solved_problems for tracking
ALTER TABLE solved_problems ADD COLUMN IF NOT EXISTS created_by VARCHAR(50) DEFAULT 'migration';
ALTER TABLE solved_problems ADD COLUMN IF NOT EXISTS debug_info JSONB DEFAULT '{}';

-- 2. Create function to safely record solved problems with proper transaction handling
CREATE OR REPLACE FUNCTION record_solved_problem_safe(
    p_user_id INTEGER,
    p_problem_id VARCHAR(36),
    p_solved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_created_by VARCHAR(50) DEFAULT 'submission'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_inserted BOOLEAN := FALSE;
    v_difficulty VARCHAR(20);
BEGIN
    -- Get problem difficulty
    SELECT difficulty INTO v_difficulty FROM problems WHERE id = p_problem_id;
    
    -- Use INSERT ... ON CONFLICT DO NOTHING for idempotency
    INSERT INTO solved_problems (user_id, problem_id, solved_at, created_by, debug_info)
    VALUES (p_user_id, p_problem_id, p_solved_at, p_created_by, 
            jsonb_build_object('difficulty', v_difficulty, 'timestamp', extract(epoch from p_solved_at)))
    ON CONFLICT (user_id, problem_id) DO NOTHING;
    
    -- Check if insertion happened
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    
    -- Only update stats if this is a NEW solve
    IF v_inserted > 0 THEN
        PERFORM update_user_stats(p_user_id);
    END IF;
    
    RETURN v_inserted > 0;
END;
$$ LANGUAGE plpgsql;

-- 3. Create function to rebuild user stats from solved_problems (source of truth)
CREATE OR REPLACE FUNCTION rebuild_user_stats_from_solved(p_user_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_solved_count INTEGER;
    v_easy_count INTEGER;
    v_medium_count INTEGER;
    v_hard_count INTEGER;
BEGIN
    -- Count solved problems by difficulty from solved_problems table (source of truth)
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
    
    -- Update user_stats table
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

-- 4. Create function to backfill existing accepted submissions
CREATE OR REPLACE FUNCTION backfill_solved_problems()
RETURNS INTEGER AS $$
DECLARE
    v_inserted_count INTEGER := 0;
    v_row RECORD;
BEGIN
    -- Process each accepted submission
    FOR v_row IN 
        SELECT DISTINCT user_id, problem_id, MIN(created_at) as first_accepted_at
        FROM submissions 
        WHERE status = 'completed' 
        AND verdict = 'accepted'
        AND user_id IS NOT NULL
        GROUP BY user_id, problem_id
    LOOP
        -- Try to insert, will skip if already exists
        PERFORM record_solved_problem_safe(
            v_row.user_id, 
            v_row.problem_id, 
            v_row.first_accepted_at,
            'backfill'
        );
        v_inserted_count := v_inserted_count + 1;
    END LOOP;
    
    RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql;

-- 5. Create function to validate data consistency
CREATE OR REPLACE FUNCTION validate_data_consistency()
RETURNS TABLE(
    user_id INTEGER,
    solved_from_solved_problems INTEGER,
    solved_from_user_stats INTEGER,
    stats_correct BOOLEAN,
    easy_from_solved INTEGER,
    easy_from_stats INTEGER,
    medium_from_solved INTEGER,
    medium_from_stats INTEGER,
    hard_from_solved INTEGER,
    hard_from_stats INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        us.user_id,
        COALESCE(sp.solved_count, 0) as solved_from_solved_problems,
        us.solved_count as solved_from_user_stats,
        (COALESCE(sp.solved_count, 0) = us.solved_count) as stats_correct,
        COALESCE(sp.easy_count, 0) as easy_from_solved,
        us.easy_solved as easy_from_stats,
        COALESCE(sp.medium_count, 0) as medium_from_solved,
        us.medium_solved as medium_from_stats,
        COALESCE(sp.hard_count, 0) as hard_from_solved,
        us.hard_solved as hard_from_stats
    FROM user_stats us
    LEFT JOIN (
        SELECT 
            sp.user_id,
            COUNT(*) as solved_count,
            COUNT(*) FILTER (WHERE p.difficulty = 'easy') as easy_count,
            COUNT(*) FILTER (WHERE p.difficulty = 'medium') as medium_count,
            COUNT(*) FILTER (WHERE p.difficulty = 'hard') as hard_count
        FROM solved_problems sp
        JOIN problems p ON sp.problem_id = p.id
        GROUP BY sp.user_id
    ) sp ON us.user_id = sp.user_id
    WHERE COALESCE(sp.solved_count, 0) != us.solved_count
       OR COALESCE(sp.easy_count, 0) != us.easy_solved
       OR COALESCE(sp.medium_count, 0) != us.medium_solved
       OR COALESCE(sp.hard_count, 0) != us.hard_solved;
END;
$$ LANGUAGE plpgsql;

-- 6. Create function to get problem status for users
CREATE OR REPLACE FUNCTION get_problem_status(p_user_id INTEGER, p_problem_id VARCHAR(36))
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'solved', EXISTS(SELECT 1 FROM solved_problems WHERE user_id = p_user_id AND problem_id = p_problem_id),
        'attempted', EXISTS(SELECT 1 FROM submissions WHERE user_id = p_user_id AND problem_id = p_problem_id AND mode = 'submit')
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 7. Create function to get leaderboard with real-time stats
CREATE OR REPLACE FUNCTION get_leaderboard_realtime(limit_count INTEGER DEFAULT 50)
RETURNS TABLE(
    user_id INTEGER,
    username VARCHAR(50),
    rating INTEGER,
    solved_count INTEGER,
    submissions_count INTEGER,
    fastest_ms INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        COALESCE(us.rating, 1200),
        COALESCE(sp.solved_count, 0),
        COALESCE(sub.submissions_count, 0),
        sub.fastest_ms
    FROM users u
    LEFT JOIN user_stats us ON u.id = us.user_id
    LEFT JOIN (
        SELECT 
            sp.user_id,
            COUNT(*) as solved_count
        FROM solved_problems sp
        GROUP BY sp.user_id
    ) sp ON u.id = sp.user_id
    LEFT JOIN (
        SELECT 
            s.user_id,
            COUNT(*) as submissions_count,
            MIN(s.runtime_ms) as fastest_ms
        FROM submissions s
        WHERE s.user_id IS NOT NULL AND s.mode = 'submit'
        GROUP BY s.user_id
    ) sub ON u.id = sub.user_id
    ORDER BY 
        COALESCE(sp.solved_count, 0) DESC,
        COALESCE(us.rating, 1200) DESC,
        u.username ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 8. Create function to get user profile with real-time data
CREATE OR REPLACE FUNCTION get_user_profile_realtime(p_user_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'user_id', u.id,
        'username', u.username,
        'email', u.email,
        'solved_count', COALESCE(sp.solved_count, 0),
        'easy_solved', COALESCE(sp.easy_count, 0),
        'medium_solved', COALESCE(sp.medium_count, 0),
        'hard_solved', COALESCE(sp.hard_count, 0),
        'rating', COALESCE(us.rating, 1200),
        'submissions_count', COALESCE(sub.submissions_count, 0),
        'recent_submissions', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', s.id,
                    'problem_slug', p.slug,
                    'problem_title', p.title,
                    'leetcode_id', p.leetcode_id,
                    'difficulty', p.difficulty,
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
    LEFT JOIN (
        SELECT 
            sp.user_id,
            COUNT(*) as solved_count,
            COUNT(*) FILTER (WHERE p.difficulty = 'easy') as easy_count,
            COUNT(*) FILTER (WHERE p.difficulty = 'medium') as medium_count,
            COUNT(*) FILTER (WHERE p.difficulty = 'hard') as hard_count
        FROM solved_problems sp
        JOIN problems p ON sp.problem_id = p.id
        GROUP BY sp.user_id
    ) sp ON u.id = sp.user_id
    LEFT JOIN user_stats us ON u.id = us.user_id
    LEFT JOIN (
        SELECT 
            s.user_id,
            COUNT(*) as submissions_count
        FROM submissions s
        WHERE s.user_id IS NOT NULL AND s.mode = 'submit'
        GROUP BY s.user_id
    ) sub ON u.id = sub.user_id
    WHERE u.id = p_user_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;