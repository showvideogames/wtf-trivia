-- ============================================================
-- ROLLBACK                          *** NOT YET APPLIED ***
--                                   *** RUN ONLY ON OWNER INSTRUCTION ***
--
-- Each section is one transaction. Run one section at a time.
--
--   R2       undo C2   back to the C1 state (needs the previous-app
--                      fallback again). Refuses if a player now has two
--                      plays on one date.
--   R1       undo C1   back to the by-date model the previous app expects.
--                      Plays made since the cutover are KEPT (and counted by
--                      date again). Run R2 first if C2 was applied.
--   R1-DATA  optional, only straight after R1 and only if nobody has played
--            since the cutover: puts back the cleared test data from
--            puzzle_id_cutover_backup.
--   RL1      undo L1   restores the permissive policies (re-opens the
--                      exposure; only if the lockdown breaks the app).
--
-- Rolling back the APP is separate: redeploy the previous Vercel build.
-- The previous app works with C1 (not with C2); the new app needs C1.
-- ============================================================


-- ===== R2  undo C2 =====
begin;
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'puzzle_stats' and column_name = 'game_date') then
    raise exception 'R2 aborted: C2 is not applied.';
  end if;
  if exists (select 1 from public.game_records group by player_id, game_date having count(*) > 1) then
    raise exception 'R2 aborted: some players have two plays on one date; the by-date rule cannot come back.';
  end if;
end $$;

alter table public.game_records
  add constraint game_records_player_id_game_date_key unique (player_id, game_date);
alter table public.puzzle_stats add column game_date date;

create or replace function public.game_records_assign_puzzle()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  match_count integer;
  match_id text;
  match_title text;
begin
  if tg_op = 'UPDATE' then
    new.puzzle_id := old.puzzle_id;
    return new;
  end if;
  if new.puzzle_id is null then
    select count(*), min(g.id), min(g.theme_title) into match_count, match_id, match_title
    from public.games g where g.status = 'published' and g.date = new.game_date;
    if match_count <> 1 or new.theme_title is distinct from match_title then
      raise exception 'No published puzzle on % matches "%". Reload the page.', new.game_date, new.theme_title
        using errcode = '23514';
    end if;
    new.puzzle_id := match_id;
  end if;
  if new.game_date is null then
    select g.date into new.game_date from public.games g where g.id = new.puzzle_id;
  end if;
  return new;
end;
$$;

create or replace function public.rebuild_puzzle_stats_for(target_puzzle_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target_puzzle_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('puzzle_stats:' || target_puzzle_id));
  delete from public.puzzle_stats where puzzle_id = target_puzzle_id;
  insert into public.puzzle_stats (puzzle_id, game_date, total_finished, total_score, perfect_count,
    total_questions, question_correct_counts, question_answer_counts, score_histogram, updated_at)
  with completed_records as (
    select * from public.game_records where completed = true and puzzle_id = target_puzzle_id
  ),
  base as (
    select count(*)::int as total_finished, coalesce(sum(score), 0)::int as total_score,
           count(*) filter (where total_questions > 0 and score = total_questions)::int as perfect_count,
           coalesce(max(total_questions), 0)::int as total_questions
    from completed_records
  ),
  idxs as (select generate_series(0, greatest((select total_questions from base) - 1, 0)) as idx),
  question_rollup as (
    select i.idx, count(a.elem)::int as answered_count,
           count(*) filter (where coalesce((a.elem ->> 'correct')::boolean, false))::int as correct_count
    from idxs i
    left join completed_records cr on true
    left join lateral (select elem from jsonb_array_elements(cr.answers) with ordinality arr(elem, ord)
                        where ord = i.idx + 1) a on true
    group by i.idx order by i.idx
  ),
  score_rollup as (
    select score::text as bucket, count(*)::int as count_value from completed_records group by score order by score
  )
  select target_puzzle_id,
         (select case when g.status = 'published' then g.date::date end from public.games g where g.id = target_puzzle_id),
         b.total_finished, b.total_score, b.perfect_count, b.total_questions,
         case when b.total_questions > 0 then (select jsonb_agg(q.correct_count order by q.idx) from question_rollup q) else '[]'::jsonb end,
         case when b.total_questions > 0 then (select jsonb_agg(q.answered_count order by q.idx) from question_rollup q) else '[]'::jsonb end,
         coalesce((select jsonb_object_agg(s.bucket, s.count_value) from score_rollup s), '{}'::jsonb),
         now()
  from base b where b.total_finished > 0;
end;
$$;

create or replace function public.games_sync_puzzle_stats_date()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.puzzle_stats
     set game_date = case when new.status = 'published' then new.date::date end
   where puzzle_id = new.id;
  return null;
end;
$$;
create trigger games_sync_puzzle_stats_date
after update of date, status on public.games
for each row execute function public.games_sync_puzzle_stats_date();

revoke execute on function public.game_records_assign_puzzle()   from public, anon, authenticated;
revoke execute on function public.rebuild_puzzle_stats_for(text) from public, anon, authenticated;
revoke execute on function public.games_sync_puzzle_stats_date() from public, anon, authenticated;

select public.rebuild_puzzle_stats();
commit;


-- ===== R1  undo C1 (back to the by-date model; plays since the cutover are kept) =====
begin;
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'game_records' and column_name = 'puzzle_id') then
    raise exception 'R1 aborted: C1 is not applied.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'puzzle_stats' and column_name = 'game_date') then
    raise exception 'R1 aborted: C2 is applied. Run R2 first.';
  end if;
end $$;

drop trigger if exists game_records_assign_puzzle on public.game_records;
drop trigger if exists games_sync_puzzle_stats_date on public.games;
drop trigger if exists game_records_completed_stats on public.game_records;
drop function if exists public.game_records_assign_puzzle();
drop function if exists public.games_sync_puzzle_stats_date();
drop function if exists public.rebuild_puzzle_stats_for(text);

drop index if exists public.games_one_published_per_date;
alter table public.games drop constraint if exists games_status_check;
alter table public.games drop constraint if exists games_published_date_iso;

alter table public.game_records drop constraint if exists game_records_puzzle_id_fkey;
alter table public.game_records drop constraint if exists game_records_player_puzzle_key;
drop index if exists public.game_records_puzzle_completed_idx;
alter table public.game_records drop column puzzle_id;
comment on column public.game_records.game_date is null;

truncate public.puzzle_stats;
alter table public.puzzle_stats drop constraint puzzle_stats_pkey;
alter table public.puzzle_stats drop constraint if exists puzzle_stats_puzzle_id_fkey;
alter table public.puzzle_stats drop column puzzle_id;
alter table public.puzzle_stats alter column game_date set not null;
alter table public.puzzle_stats add constraint puzzle_stats_pkey primary key (game_date);
comment on column public.puzzle_stats.game_date is null;

-- The by-date functions exactly as they were live before C1.
create or replace function public.rebuild_single_puzzle_stats(target_game_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.puzzle_stats
  where game_date = target_game_date;

  insert into public.puzzle_stats (
    game_date,
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
      and game_date::date = target_game_date
  ),
  base as (
    select
      target_game_date::date as game_date,
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
    b.game_date,
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
    end as question_correct_counts,
    case
      when b.total_questions > 0 then (
        select jsonb_agg(q.answered_count order by q.idx)
        from question_rollup q
      )
      else '[]'::jsonb
    end as question_answer_counts,
    coalesce(
      (select jsonb_object_agg(s.bucket, s.count_value) from score_rollup s),
      '{}'::jsonb
    ) as score_histogram,
    now()
  from base b
  where b.total_finished > 0;
end;
$$;

create or replace function public.handle_completed_game_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed and (
    tg_op = 'insert'
    or not coalesce(old.completed, false)
    or old.score is distinct from new.score
    or old.answers is distinct from new.answers
    or old.total_questions is distinct from new.total_questions
  ) then
    perform public.rebuild_single_puzzle_stats(new.game_date::date);
  end if;
  return new;
end;
$$;

create or replace function public.rebuild_puzzle_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
begin
  truncate table public.puzzle_stats;

  for d in
    select distinct game_date
    from public.game_records
    where completed = true
    order by game_date
  loop
    perform public.rebuild_single_puzzle_stats(d::date);
  end loop;
end;
$$;

create trigger game_records_completed_stats
after insert or update on public.game_records
for each row
execute function public.handle_completed_game_record();

select public.rebuild_puzzle_stats();
commit;


-- ===== R1-DATA  optional: restore the cleared test data (only right after R1) =====
begin;
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'game_records' and column_name = 'puzzle_id') then
    raise exception 'R1-DATA aborted: run R1 first.';
  end if;
  if exists (select 1 from public.game_records) or exists (select 1 from public.player_stats) then
    raise exception 'R1-DATA aborted: there are plays or player stats since the cutover; restoring would mix them.';
  end if;
end $$;
insert into auth.users select * from puzzle_id_cutover_backup.synthetic_users
  on conflict (id) do nothing;
insert into public.players
  select * from puzzle_id_cutover_backup.players b
  where b.id in (select id from puzzle_id_cutover_backup.synthetic_users)
  on conflict (id) do nothing;
insert into public.game_records overriding system value
  select * from puzzle_id_cutover_backup.game_records;
select setval(pg_get_serial_sequence('public.game_records', 'id'),
              greatest((select max(id) from public.game_records), 1));
insert into public.player_stats select * from puzzle_id_cutover_backup.player_stats;
truncate public.puzzle_stats;
insert into public.puzzle_stats select * from puzzle_id_cutover_backup.puzzle_stats;
commit;


-- ===== RL1  undo L1 (re-opens the exposure; only if the lockdown breaks the app) =====
-- Recreates the eight policies exactly as audit A0 listed them, and lets
-- visitors call the stats functions again, as before L1.
begin;
create policy "Players can read own row" on public.players for select to public using (true);
create policy "Anyone can create a player" on public.players for insert to public with check (true);
create policy "Players can read own records" on public.game_records for select to public using (true);
create policy "Players can insert own records" on public.game_records for insert to public with check (true);
create policy "Players can update own records" on public.game_records for update to public using (true);
create policy "Players can read own stats" on public.player_stats for select to public using (true);
create policy "Players can insert own stats" on public.player_stats for insert to public with check (true);
create policy "Players can update own stats" on public.player_stats for update to public using (true);
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('rebuild_single_puzzle_stats', 'rebuild_puzzle_stats',
                        'handle_completed_game_record', 'apply_completed_game_to_puzzle_stats')
  loop
    execute format('grant execute on function %s to public, anon, authenticated', f.sig);
  end loop;
end $$;
commit;
