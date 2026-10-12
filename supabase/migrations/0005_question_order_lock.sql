-- ============================================================
-- 0005  Question order lock: a played puzzle's order never changes
--
-- A play stores its answers by position (game_records.answers, the
-- per-question counts in puzzle_stats, and the 1/0 digits of every shared
-- result link /s/<id>.<digits>). Reordering a puzzle after anyone has played
-- it would pin those answers on the wrong questions. Its date says nothing
-- reliable about that: a played puzzle can be moved to a future day.
--
-- ADDITIVE AND BACKWARD-COMPATIBLE
--   * two functions and a trigger; no column, policy or grant on an
--     existing object changes; no row is written;
--   * safe to run more than once.
--   * Without it the Studio can't confirm a saved puzzle is unplayed, so it
--     keeps every saved puzzle's question order locked (new, never-saved
--     puzzles can still be reordered).
--
-- WHAT IT DOES
--   1. public.wtf_question_order_changed(before, after): whether the
--      questions present in both lists come in a different order. A question
--      is known by its id (by its item text if it has none). Editing a
--      question, adding one or removing one is not a reorder.
--   2. public.wtf_puzzle_has_plays(puzzle_id): for Studio admins only,
--      whether any saved play (finished or not) exists for the puzzle. The
--      Studio asks before it offers reordering and again before it saves a
--      new order.
--   3. Trigger games_question_order_lock: an update that reorders the
--      questions of a puzzle with any saved play is refused
--      (games_question_order_locked), whoever sends it.
--
-- APPLYING IT (not automatic): in the hosted WTF project's SQL Editor, or with
--   node tools/hosted.mjs sql --file supabase/migrations/0005_question_order_lock.sql
-- (a rehearsal) and then again with --apply. No content changes.
--
-- ROLLBACK (only if needed; the Studio then locks reordering of every saved
-- puzzle again):
--   drop trigger if exists games_question_order_lock on public.games;
--   drop function if exists public.games_question_order_lock();
--   drop function if exists public.wtf_puzzle_has_plays(text);
--   drop function if exists public.wtf_question_order_changed(jsonb, jsonb);
-- ============================================================

-- 1. Same rule as questionOrderChanged in src/admin/questionStatus.js.
create or replace function public.wtf_question_order_changed(before jsonb, after jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with o as (
    select coalesce(e->>'id', 'item:' || coalesce(e->>'itemText', '')) as k, n
    from jsonb_array_elements(case when jsonb_typeof(before) = 'array' then before else '[]'::jsonb end) with ordinality as t(e, n)
  ), a as (
    select coalesce(e->>'id', 'item:' || coalesce(e->>'itemText', '')) as k, n
    from jsonb_array_elements(case when jsonb_typeof(after) = 'array' then after else '[]'::jsonb end) with ordinality as t(e, n)
  )
  select (select coalesce(array_agg(k order by n), '{}') from o where k in (select k from a))
         is distinct from
         (select coalesce(array_agg(k order by n), '{}') from a where k in (select k from o))
$$;

-- 2. Admins only: players can't learn about other people's plays.
create or replace function public.wtf_puzzle_has_plays(target_puzzle_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_wtf_admin() then
    raise exception 'wtf_admin_only: only Studio admins can check a puzzle''s plays.'
      using errcode = 'insufficient_privilege';
  end if;
  return exists (select 1 from public.game_records r where r.puzzle_id = target_puzzle_id);
end
$$;

-- 3. The lock itself, at save time.
create or replace function public.games_question_order_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wtf_question_order_changed(old.questions, new.questions)
     and exists (select 1 from public.game_records r where r.puzzle_id = old.id) then
    raise exception 'games_question_order_locked: puzzle % has saved plays, so its question order can''t change.', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists games_question_order_lock on public.games;
create trigger games_question_order_lock
  before update of questions on public.games
  for each row execute function public.games_question_order_lock();

revoke all on function public.wtf_question_order_changed(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.games_question_order_lock() from public, anon, authenticated;
revoke all on function public.wtf_puzzle_has_plays(text) from public, anon;
grant execute on function public.wtf_puzzle_has_plays(text) to authenticated;
