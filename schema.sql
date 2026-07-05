-- ---------------------------------------------------------------------------
-- Finance Tracker database schema
--
-- Run this ONCE in your Supabase project:
--   Supabase dashboard > SQL Editor > New query > paste this > Run.
--
-- It creates a single table that stores each user's transactions and settings,
-- and turns on Row Level Security so a signed-in user can only ever read or
-- write their OWN row. That RLS policy is what makes it safe to ship the public
-- "anon" key in the browser (config.js).
-- ---------------------------------------------------------------------------

create table if not exists public.finance_data (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  txns_json     jsonb       not null default '[]'::jsonb,
  settings_json jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

alter table public.finance_data enable row level security;

-- One policy covering select / insert / update / delete: a row is only visible
-- and writable by the user whose id matches it.
drop policy if exists "Users manage their own finance data" on public.finance_data;
create policy "Users manage their own finance data"
  on public.finance_data
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
