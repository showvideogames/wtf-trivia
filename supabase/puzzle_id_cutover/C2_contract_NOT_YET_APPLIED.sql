-- ============================================================
-- C2  CONTRACT: DATES STOP BEING A KEY ANYWHERE
--                                   *** NOT YET APPLIED ***
--                                   *** DO NOT RUN WITHOUT OWNER APPROVAL ***
--
-- Run only after the puzzle-id app is live in production and verified, and
-- after open tabs of the previous app have had time to reload (a few hours).
--
--   * drops the one-record-per-player-per-DATE rule: a player can play
--     every puzzle once, even two puzzles that ran on the same date
--   * plays must name their puzzle (the by-date fallback for the previous
--     app is removed; an old tab gets a clear error and a reload fixes it)
--   * puzzle_stats loses its temporary date copy
--
-- One transaction. Undo: R_rollback_NOT_YET_APPLIED.sql, section R2.
-- ============================================================

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'game_records' and column_name = 'puzzle_id') then
    raise exception 'C2 aborted: C1 has not been applied.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'puzzle_stats' and column_name = 'game_date') then
    raise exception 'C2 aborted: C2 has already been applied.';
  end if;
end $$;

-- 1. The date is no longer part of a play's identity.
alter table public.game_records drop constraint game_records_player_id_game_date_key;

-- 2. Plays must name their puzzle; the date is only filled in if missing.
create or replace function public.game_records_assign_puzzle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- A play never moves to another puzzle.
    new.puzzle_id := old.puzzle_id;
    return new;
  end if;
  if new.game_date is null then
    select g.date into new.game_date from public.games g where g.id = new.puzzle_id;
  end if;
  return new;
end;
$$;

-- 3. Stats rows no longer carry a date.
drop trigger if exists games_sync_puzzle_stats_date on public.games;
drop function if exists public.games_sync_puzzle_stats_date();

create or replace function public.rebuild_puzzle_stats_for(target_puzzle_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_puzzle_id is null then
    return;
  end if;

  -- One rebuild of a puzzle at a time (simultaneous-finisher fix).
  perform pg_advisory_xact_lock(hashtext('puzzle_stats:' || target_puzzle_id));

  delete from public.puzzle_stats where puzzle_id = target_puzzle_id;

  insert into public.puzzle_stats (
    puzzle_id,
    total_finished,
    total_score,
    perfect_count,
    total_questions,
    question_correct_counts,
    question_answer_counts,
    score_histogram,
    updated_at
  )
  with completed_records as (
    select *
    from public.game_records
    where completed = true
      and puzzle_id = target_puzzle_id
  ),
  base as (
    select
      count(*)::int as total_finished,
      coalesce(sum(score), 0)::int as total_score,
      count(*) filter (
        where total_questions > 0 and score = total_questions
      )::int as perfect_count,
      coalesce(max(total_questions), 0)::int as total_questions
    from completed_records
  ),
  idxs as (
    select generate_series(
      0,
      greatest((select total_questions from base) - 1, 0)
    ) as idx
  ),
  question_rollup as (
    select
      i.idx,
      count(a.elem)::int as answered_count,
      count(*) filter (
        where coalesce((a.elem ->> 'correct')::boolean, false)
      )::int as correct_count
    from idxs i
    left join completed_records cr on true
    left join lateral (
      select elem
      from jsonb_array_elements(cr.answers) with ordinality arr(elem, ord)
      where ord = i.idx + 1
    ) a on true
    group by i.idx
    order by i.idx
  ),
  score_rollup as (
    select score::text as bucket, count(*)::int as count_value
    from completed_records
    group by score
    order by score
  )
  select
    target_puzzle_id,
    b.total_finished,
    b.total_score,
    b.perfect_count,
    b.total_questions,
    case
      when b.total_questions > 0 then (
        select jsonb_agg(q.correct_count order by q.idx)
        from question_rollup q
      )
      else '[]'::jsonb
    end,
    case
      when b.total_questions > 0 then (
        select jsonb_agg(q.answered_count order by q.idx)
        from question_rollup q
      )
      else '[]'::jsonb
    end,
    coalesce(
      (select jsonb_object_agg(s.bucket, s.count_value) from score_rollup s),
      '{}'::jsonb
    ),
    now()
  from base b
  where b.total_finished > 0;
end;
$$;

alter table public.puzzle_stats drop column game_date;

revoke execute on function public.game_records_assign_puzzle()   from public, anon, authenticated;
revoke execute on function public.rebuild_puzzle_stats_for(text) from public, anon, authenticated;

-- 4. Recount everything once under the final function.
select public.rebuild_puzzle_stats();

commit;

-- 5. Report (read-only).
select (select count(*) from public.game_records)                 as plays,
       (select count(*) from public.puzzle_stats)                 as stats_rows,
       (select count(*) from (select player_id, game_date from public.game_records
                               group by 1, 2 having count(*) > 1) x) as players_with_two_plays_on_one_date;
