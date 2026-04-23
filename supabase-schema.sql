-- =====================================================================
-- LAN Check-In · Supabase schema
-- Paste this entire file into: Supabase dashboard -> SQL editor -> Run
-- =====================================================================

-- 1. Tables ------------------------------------------------------------

-- Single-row table holding the full floor-plan JSON (tables, nodes,
-- sections, map size, grid). The app always reads/writes id = 'main'.
create table if not exists public.layouts (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- One row per (date, station). date is YYYY-MM-DD (app-side string).
-- node_id is the layout's node id.
create table if not exists public.checkins (
  date            text not null,
  node_id         text not null,
  name            text not null,
  discord         text default '',
  phone           text default '',
  checked_in_at   timestamptz not null default now(),
  primary key (date, node_id)
);

create index if not exists checkins_date_idx on public.checkins(date);

-- 2. Row-level security ------------------------------------------------
-- Public read + write for the anon key. This matches the app's design:
-- the admin passcode is a client-side UX gate, and the ops staff
-- checking people in all use the same anon key.
--
-- IMPORTANT: This model assumes the deployment URL is only shared with
-- trusted staff. If you need stronger guarantees, replace these policies
-- with Supabase Auth (see README.md "Hardening" section).

alter table public.layouts  enable row level security;
alter table public.checkins enable row level security;

drop policy if exists "layouts: public read"  on public.layouts;
drop policy if exists "layouts: public write" on public.layouts;
drop policy if exists "checkins: public read"  on public.checkins;
drop policy if exists "checkins: public write" on public.checkins;

create policy "layouts: public read"
  on public.layouts for select
  using (true);

create policy "layouts: public write"
  on public.layouts for all
  using (true)
  with check (true);

create policy "checkins: public read"
  on public.checkins for select
  using (true);

create policy "checkins: public write"
  on public.checkins for all
  using (true)
  with check (true);

-- 3. Realtime ----------------------------------------------------------
-- Make both tables broadcast changes so every open browser stays in sync.

-- Safe to run repeatedly: wrapped in a DO block that ignores duplicates.
do $$
begin
  begin
    alter publication supabase_realtime add table public.layouts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.checkins;
  exception when duplicate_object then null;
  end;
end $$;

-- 4. Seed the single layout row so the first write is an update, not an
-- insert (keeps the realtime UPDATE event path simple).
insert into public.layouts (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
