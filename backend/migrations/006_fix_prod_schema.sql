-- =====================================================================
-- 006_fix_prod_schema.sql
-- Run this in your Supabase / Postgres Database Dashboard
-- It resolves duplicate problems, missing columns, and prepares schemas
-- =====================================================================

BEGIN;

-- 1. FIX DUPLICATE PROBLEMS
-- Identify all problems that have identical slugs and keep only the oldest one
DELETE FROM public.problems
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at ASC) as rn
        FROM public.problems
    ) duplicates
    WHERE duplicates.rn > 1
);

-- Ensure future uniqueness on the problem slug
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_problem_slug'
    ) THEN
        ALTER TABLE public.problems ADD CONSTRAINT uq_problem_slug UNIQUE (slug);
    END IF;
END $$;


-- 2. FIX CONTEST API (Missing Columns)
-- The FastAPI backend Contest model expects 'is_rated' and 'description' columns
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS is_rated BOOLEAN DEFAULT FALSE;


-- 3. AUTHENTICATION & SCHEMA ALIGNMENT WARNING
-- NOTE: If your backend users 'User' table (Integer ID) while `supabase_schema.sql` uses `auth.users` (UUID),
-- you must drop the foreign key reference to `auth.users` on tables like `submissions`, `solved_problems`, etc.,
-- and change `user_id` types to INTEGER depending on which Authentication Strategy you decide to keep.
-- 
-- Example fix (Uncomment if moving fully to FastAPI Custom Integer Auth):
-- ALTER TABLE public.submissions DROP CONSTRAINT submissions_user_id_fkey;
-- ALTER TABLE public.submissions ALTER COLUMN user_id TYPE INTEGER USING user_id::integer;
-- ALTER TABLE public.submissions ADD CONSTRAINT submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

COMMIT;
