-- Safe schema patch for existing `public.users` table.
-- Fixes: psycopg2.errors.UndefinedColumn: column users.email does not exist
-- Apply in Supabase SQL Editor. This preserves existing data.

alter table public.users
  add column if not exists email text;

alter table public.users
  add column if not exists display_name text;

alter table public.users
  add column if not exists avatar_url text;

alter table public.users
  add column if not exists bio text;

-- Add uniqueness for email (if not already present).
-- Using an index is more robust across environments.
create unique index if not exists users_email_unique_idx
  on public.users (email)
  where email is not null;

-- Optional: ensure created_at exists with default.
alter table public.users
  add column if not exists created_at timestamptz not null default now();

