-- ============================================================
-- 0005  Played question lock: a played puzzle keeps its questions'
--       count, order and positions
--
-- A play stores its answers by position: game_records.answers (by
-- questionIndex), the per-question counts in puzzle_stats, and the 1/0
-- digits of every shared result link /s/<id>.<digits>, whose preview is
-- only shown while the puzzle has exactly that many questions
-- (answersFit, src/shareLink.js). So once anyone has played a puzzle:
--   * reordering pins old answers on the wrong questions;
--   * deleting a question shifts every later one up a place;
--   * adding (or deleting) one changes the count, so shared result links
--     stop showing their result and totals stop matching.
-- Editing a question's wording, commentary, explanation or media keeps
-- every position and stays allowed. A puzzle's date says nothing reliable
-- about plays: a played puzzle can be moved to a future day.
--
-- ADDITIVE AND BACKWARD-COMPATIBLE
--   * three functions and a trigger; no column, policy or grant on an
--     existing object changes; no row is written;
--   * safe to run more than once.
--   * Without it the Studio can't confirm a saved puzzle is unplayed, so it
--     keeps every saved puzzle's question structure locked (new,
--     never-saved puzzles stay fully editable; wording edits always work).
--
-- WHAT IT DOES
--   1. public.wtf_question_order_changed(before, after): whether the
--      questions present in both lists come in a different order (a
--      question is known by its id, or by its item text if it has none).
--   2. public.wtf_question_structure_changed(before, after): a different
--      number of questions, a different question id at any position, or a
--      new order. Same rule as questionStructureChanged in
--      src/admin/questionStatus.js.
--   3. public.wtf_puzzle_has_plays(puzzle_id): for Studio admins only,
--      whether any saved play (finished or not) exists for the puzzle. The
--      Studio asks before it offers structural changes and again before it
--      saves one.
--   4. Trigger games_played_question_lock: an update that changes the
--      question structure of a puzzle with any saved play is refused
--      (games_questions_locked), whoever sends it.
--
-- APPLYING IT (not automatic): in the hosted WTF project's SQL Editor, or
-- with
--   node tools/hosted.mjs sql --file supabase/migrations/0005_played_question_lock.sql
-- (a rehearsal) and then again with --apply. No content changes.
--
-- ROLLBACK (only if needed; the Studio then locks the question structure
-- of every saved puzzle again):
--   drop trigger if exists games_played_question_lock on public.games;
--   drop function if exists public.games_played_question_lock();
--   drop function if exists public.wtf_puzzle_has_plays(text);
--   drop function if exists public.wtf_question_structure_changed(jsonb, jsonb);
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

-- 2. Same rule as questionStructureChanged in src/admin/questionStatus.js.
create or replace function public.wtf_question_structure_changed(before jsonb, after jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with b as (select case when jsonb_typeof(before) = 'array' then before else '[]'::jsonb end as v),
       a as (select case when jsonb_typeof(after) = 'array' then after else '[]'::jsonb end as v)
  select jsonb_array_length((select v from b)) <> jsonb_array_length((select v from a))
      or exists (
           select 1
           from jsonb_array_elements((select v from b)) with ordinality as x(e, n)
           join jsonb_array_elements((select v from a)) with ordinality as y(e, n) using (n)
           where (x.e->>'id') is distinct from (y.e->>'id'))
      or public.wtf_question_order_changed((select v from b), (select v from a))
$$;

-- 3. Admins only: players can't learn about other people's plays.
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

-- 4. The lock itself, at save time.
create or replace function public.games_played_question_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wtf_question_structure_changed(old.questions, new.questions)
     and exists (select 1 from public.game_records r where r.puzzle_id = old.id) then
    raise exception 'games_questions_locked: puzzle % has saved plays, so its questions can''t be added, deleted or reordered.', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists games_played_question_lock on public.games;
create trigger games_played_question_lock
  before update of questions on public.games
  for each row execute function public.games_played_question_lock();

revoke all on function public.wtf_question_order_changed(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.wtf_question_structure_changed(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.games_played_question_lock() from public, anon, authenticated;
revoke all on function public.wtf_puzzle_has_plays(text) from public, anon;
grant execute on function public.wtf_puzzle_has_plays(text) to authenticated;
