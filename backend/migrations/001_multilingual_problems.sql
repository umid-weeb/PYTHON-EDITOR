-- Migration: Add multilingual problem content system
-- This migration adds support for Uzbek as default language while keeping English

-- 1. Add leetcode_id column to problems table
ALTER TABLE problems ADD COLUMN leetcode_id INTEGER NULL;

-- 2. Create problem_translations table
CREATE TABLE problem_translations (
    id SERIAL PRIMARY KEY,
    problem_id VARCHAR(36) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    language_code VARCHAR(5) NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    input_format TEXT,
    output_format TEXT,
    constraints TEXT,
    starter_code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate translations for same problem and language
    UNIQUE (problem_id, language_code),
    
    -- Indexes for performance
    INDEX idx_problem_translations_problem_id (problem_id),
    INDEX idx_problem_translations_language_code (language_code)
);

-- 3. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_problem_translations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Create trigger to automatically update updated_at
CREATE TRIGGER update_problem_translations_updated_at
    BEFORE UPDATE ON problem_translations
    FOR EACH ROW
    EXECUTE FUNCTION update_problem_translations_updated_at();

-- 5. Create index on problems table for leetcode_id
CREATE INDEX idx_problems_leetcode_id ON problems(leetcode_id);

-- 6. Create function to get problem translation with fallback
CREATE OR REPLACE FUNCTION get_problem_translation(
    p_problem_id VARCHAR(36),
    p_language_code VARCHAR(5) DEFAULT 'uz'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Try to get the requested language first
    SELECT jsonb_build_object(
        'title', pt.title,
        'description', pt.description,
        'input_format', pt.input_format,
        'output_format', pt.output_format,
        'constraints', pt.constraints,
        'starter_code', pt.starter_code,
        'language_code', pt.language_code
    ) INTO result
    FROM problem_translations pt
    WHERE pt.problem_id = p_problem_id 
    AND pt.language_code = p_language_code;
    
    -- If not found, fallback to English
    IF result IS NULL THEN
        SELECT jsonb_build_object(
            'title', pt.title,
            'description', pt.description,
            'input_format', pt.input_format,
            'output_format', pt.output_format,
            'constraints', pt.constraints,
            'starter_code', pt.starter_code,
            'language_code', pt.language_code
        ) INTO result
        FROM problem_translations pt
        WHERE pt.problem_id = p_problem_id 
        AND pt.language_code = 'en';
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 7. Create view for simplified problem access with translations
CREATE OR REPLACE VIEW problem_with_translations AS
SELECT 
    p.id,
    p.slug,
    p.difficulty,
    p.function_name,
    p.tags_json,
    p.created_at,
    p.leetcode_id,
    COALESCE(pt.title, p.title) as title,
    COALESCE(pt.description, p.description) as description,
    COALESCE(pt.input_format, p.input_format) as input_format,
    COALESCE(pt.output_format, p.output_format) as output_format,
    COALESCE(pt.constraints, p.constraints) as constraints,
    COALESCE(pt.starter_code, p.starter_code) as starter_code,
    COALESCE(pt.language_code, 'en') as language_code
FROM problems p
LEFT JOIN problem_translations pt ON p.id = pt.problem_id AND pt.language_code = 'uz';