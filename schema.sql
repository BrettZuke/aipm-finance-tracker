-- ---------------------------------------------------------------------------
-- Finance Tracker database schema
--
-- Run this ONCE in your Supabase project:
--   Supabase dashboard > SQL Editor > New query > paste this > Run.
-- Running it again later is safe (it updates the rules, it never deletes data).
--
-- It creates the table that stores each user's transactions and settings, and
-- turns on Row Level Security so a signed-in user can only ever read or write
-- their OWN row (plus the rows of anyone they manage, see the second part).
-- Those rules are what make it safe to ship the public "anon" key in the
-- browser (config.js).
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

-- ---------------------------------------------------------------------------
-- Managing someone else's account (optional to use, safe to create)
--
-- A row here lets one login (manager_id) open and edit another person's
-- finances (member_id), for example a parent's. The app shows that login a
-- picker in the header. Nobody can add rows from the app; add them in the SQL
-- Editor (README.md, Part 3 shows how).
-- ---------------------------------------------------------------------------

create table if not exists public.finance_managers (
  manager_id uuid not null references auth.users (id) on delete cascade,
  member_id  uuid not null references auth.users (id) on delete cascade,
  label      text not null default '',
  created_at timestamptz not null default now(),
  primary key (manager_id, member_id),
  check (manager_id <> member_id)
);

alter table public.finance_managers enable row level security;
revoke all on public.finance_managers from anon, authenticated;
grant select on public.finance_managers to authenticated;

-- A login can see only the people it manages (and can't add itself to anyone).
drop policy if exists "Managers see who they manage" on public.finance_managers;
create policy "Managers see who they manage"
  on public.finance_managers
  for select
  to authenticated
  using (manager_id = auth.uid());

-- A manager can read and save the finance rows of the people they manage.
drop policy if exists "Managers manage their members' finance data" on public.finance_data;
create policy "Managers manage their members' finance data"
  on public.finance_data
  for all
  to authenticated
  using (exists (select 1 from public.finance_managers m where m.manager_id = auth.uid() and m.member_id = finance_data.user_id))
  with check (exists (select 1 from public.finance_managers m where m.manager_id = auth.uid() and m.member_id = finance_data.user_id));
