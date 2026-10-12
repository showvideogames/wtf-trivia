-- ============================================================
-- 0006  Temporary beta editing override for the played question lock
--
-- During the beta the puzzles are disposable test data, so the owner may
-- switch off the played question lock (0005) for a limited time: Studio
-- admins can then add, delete, shuffle and reorder questions on puzzles
-- that are published, live, retired or already played. Those edits can make
-- old scores, Nerd Mode picks, puzzle stats and shared result links stop
-- matching their questions. Nothing is deleted.
--
-- The normal protection is kept, not removed: the 0005 trigger stays
-- installed and only stands aside while the override is on and unexpired.
-- TURN IT OFF BEFORE LAUNCH (docs/pre-launch-checklist.md).
--
-- WHAT IT DOES
--   1. public.wtf_flags: one row, 'beta_editing', OFF by default. Turning it
--      on requires an end time (expires_at); past it, the lock is back on its
--      own. No client role can read or write the table (RLS on, no
--      policies, no grants); only the owner changes it, in the SQL Editor.
--   2. public.wtf_beta_editing_active(): the override is on and unexpired
--      (internal).
--   3. public.wtf_beta_editing(): for Studio admins only, {enabled,
--      expires_at}, so the Studio unlocks exactly when the database does.
--   4. games_played_question_lock (from 0005) lets a structural change
--      through while the override is active; otherwise unchanged.
--
-- ADDITIVE: one new table, two new functions, one function body replaced;
-- writes only the flag row (off). Safe to run more than once.
--
-- TURN ON (explicit, temporary; here for 30 days):
--   update public.wtf_flags set enabled = true, expires_at = now() + interval '30 days', updated_at = now()
--   where name = 'beta_editing';
-- TURN OFF (restores the protection at once):
--   update public.wtf_flags set enabled = false, expires_at = null, updated_at = now()
--   where name = 'beta_editing';
--
-- ROLLBACK (only if needed): turn it off, then re-run 0005_played_question_lock.sql
-- (restores the original trigger function) and
--   drop function if exists public.wtf_beta_editing();
--   drop function if exists public.wtf_beta_editing_active();
--   drop table if exists public.wtf_flags;
-- ============================================================

-- 1. The switch.
create table if not exists public.wtf_flags (
  name text primary key check (name in ('beta_editing')),
  enabled boolean not null default false,
  expires_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  constraint wtf_flags_temporary check (not enabled or expires_at is not null)
);
alter table public.wtf_flags enable row level security;
revoke all on table public.wtf_flags from public, anon, authenticated;

insert into public.wtf_flags (name, enabled, note)
values ('beta_editing', false, 'Temporary beta override of the played question lock (0005). Turn off before launch.')
on conflict (name) do nothing;

-- 2. Is it on right now?
create or replace function public.wtf_beta_editing_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wtf_flags f
    where f.name = 'beta_editing' and f.enabled and f.expires_at > now())
$$;

-- 3. What the Studio reads (admins only).
create or replace function public.wtf_beta_editing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_wtf_admin() then
    raise exception 'wtf_admin_only: only Studio admins can read the beta editing switch.'
      using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'enabled', public.wtf_beta_editing_active(),
    'expires_at', (select f.expires_at from public.wtf_flags f where f.name = 'beta_editing' and f.enabled));
end
$$;

-- 4. The 0005 lock, standing aside only while the override is active.
create or replace function public.games_played_question_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wtf_beta_editing_active() then
    return new;
  end if;
  if public.wtf_question_structure_changed(old.questions, new.questions)
     and exists (select 1 from public.game_records r where r.puzzle_id = old.id) then
    raise exception 'games_questions_locked: puzzle % has saved plays, so its questions can''t be added, deleted or reordered.', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

revoke all on function public.wtf_beta_editing_active() from public, anon, authenticated;
revoke all on function public.games_played_question_lock() from public, anon, authenticated;
revoke all on function public.wtf_beta_editing() from public, anon;
grant execute on function public.wtf_beta_editing() to authenticated;
