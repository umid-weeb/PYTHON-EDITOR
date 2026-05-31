-- Submissions jadvalidagi external_submission_id ustunini ixtiyoriy qilish
-- Bu xatolikni bartaraf etadi: psycopg2.errors.NotNullViolation

ALTER TABLE submissions 
ALTER COLUMN external_submission_id DROP NOT NULL;