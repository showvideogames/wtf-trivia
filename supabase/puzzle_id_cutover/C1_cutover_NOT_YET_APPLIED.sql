-- ============================================================
-- C1  CUTOVER: CLEAN GAMEPLAY RESET + PUZZLE-ID MODEL
--                                   *** NOT YET APPLIED ***
--                                   *** DO NOT RUN WITHOUT OWNER APPROVAL ***
--
-- One transaction. If any check fails, nothing changes.
--
-- KEEPS: every puzzle and its content, every genuine player and auth user.
-- CLEARS (disposable test data, confirmed by the owner 2026-09-28):
--   * all game_records and all puzzle_stats
--   * all player_stats rows (streaks, totals, best combo); the app treats
--     a missing row as zeros and creates it again on the next finish
--   * the 50 synthetic players and their auth users, identified exactly as
--     results_test_cleanup.sql does: email results_test_player_NN@example.invalid
--     AND id = md5('results_test_player_NN')
--
-- NEW MODEL:
--   * every play and every stats row belongs to games.id (puzzle_id);
--     the date on a play is only a snapshot of its scheduled day
--   * one record per player per puzzle
--   * at most one PUBLISHED puzzle per date (drafts/retired may share)
--   * a puzzle with plays can't be deleted; retire it (status 'retired')
--   * stats rebuilt per puzzle, one rebuild of a puzzle at a time
--     (fixes the simultaneous-finisher failure, follow-up #7)
--
-- COMPATIBLE WITH THE APP CURRENTLY IN PRODUCTION until the new app is
-- deployed: a play saved by date gets its puzzle_id from the one published
-- puzzle on that date (only if the title matches), and each stats row keeps
-- a copy of its published puzzle's date for by-date reads. C2 removes both.
--
-- A private copy of the cleared data is kept in schema
-- puzzle_id_cutover_backup (not reachable through the API).
-- Undo: R_rollback_NOT_YET_APPLIED.sql, section R1.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Guards: the live shape must be what audit A0 reported.
-- ------------------------------------------------------------
do $$
declare bad text;
begin
  -- The SQL Editor role must own everything this script changes, and be
  -- allowed to remove the synthetic auth users.
  select string_agg(c.oid::regclass::text, ', ') into bad
  from pg_class c
  where c.oid in ('public.games'::regclass, 'public.game_records'::regclass, 'public.puzzle_stats'::regclass,
                  'public.player_stats'::regclass, 'public.players'::regclass)
    and not pg_has_role(current_user, c.relowner, 'USAGE');
  if bad is not null then
    raise exception 'C1 aborted: % is not owned by %; run as the owner.', bad, current_user;
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into bad
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('rebuild_single_puzzle_stats', 'rebuild_puzzle_stats', 'handle_completed_game_record',
                      'apply_completed_game_to_puzzle_stats')
    and not pg_has_role(current_user, p.proowner, 'USAGE');
  if bad is not null then
    raise exception 'C1 aborted: function(s) % not owned by %.', bad, current_user;
  end if;
  if not has_table_privilege('auth.users', 'DELETE') then
    raise exception 'C1 aborted: % may not delete from auth.users (needed to remove synthetic users).', current_user;
  end if;
  -- Shape checks read the catalog directly (independent of privileges).
  if (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.games'::regclass and attname = 'id' and not attisdropped) is distinct from 'text' then
    raise exception 'C1 aborted: games.id is not text.';
  end if;
  if exists (select 1 from pg_attribute
              where attrelid in ('public.game_records'::regclass, 'public.puzzle_stats'::regclass)
                and attname = 'puzzle_id' and not attisdropped) then
    raise exception 'C1 aborted: puzzle_id already exists (C1 already applied?).';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.game_records'::regclass
                    and conname = 'game_records_player_id_game_date_key') then
    raise exception 'C1 aborted: expected constraint game_records_player_id_game_date_key is missing.';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.puzzle_stats'::regclass and conname = 'puzzle_stats_pkey'
                    and pg_get_constraintdef(oid) = 'PRIMARY KEY (game_date)') then
    raise exception 'C1 aborted: puzzle_stats is not keyed by game_date as expected.';
  end if;
  select string_agg(d, ', ') into bad
  from (select date d from public.games where status = 'published' group by 1 having count(*) > 1) x;
  if bad is not null then
    raise exception 'C1 aborted: more than one published puzzle on %. Fix in Admin first.', bad;
  end if;
  select string_agg(id || '=' || date, ', ') into bad
  from public.games where status = 'published' and date !~ '^\d{4}-\d{2}-\d{2}$';
  if bad is not null then
    raise exception 'C1 aborted: published puzzles with a date not in YYYY-MM-DD form: %', bad;
  end if;
  select string_agg(distinct coalesce(status, '(null)'), ', ') into bad
  from public.games where status is null or status not in ('draft', 'published', 'retired');
  if bad is not null then
    raise exception 'C1 aborted: unexpected puzzle status value(s): %', bad;
  end if;
  -- Never touch an account that uses the marker email but not the marker id.
  select string_agg(u.id::text, ', ') into bad
  from auth.users u
  where u.email like 'results\_test\_player\_%@example.invalid' escape '\'
    and u.id <> md5(split_part(u.email, '@', 1))::uuid;
  if bad is not null then
    raise exception 'C1 aborted: marker emails on non-synthetic ids: %. Decide by hand.', bad;
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Private backup of everything this step clears or changes.
-- ------------------------------------------------------------
create temp table c1_synthetic on commit drop as
select u.id from auth.users u
where u.email like 'results\_test\_player\_%@example.invalid' escape '\'
  and u.id = md5(split_part(u.email, '@', 1))::uuid
union
select p.id from public.players p
where p.email like 'results\_test\_player\_%@example.invalid' escape '\'
  and p.id = md5(split_part(p.email, '@', 1))::uuid;

create schema puzzle_id_cutover_backup;
revoke all on schema puzzle_id_cutover_backup from public;
create table puzzle_id_cutover_backup.games           as table public.games;
create table puzzle_id_cutover_backup.game_records    as table public.game_records;
create table puzzle_id_cutover_backup.puzzle_stats    as table public.puzzle_stats;
create table puzzle_id_cutover_backup.player_stats    as table public.player_stats;
create table puzzle_id_cutover_backup.players         as table public.players;
create table puzzle_id_cutover_backup.synthetic_users as
  select * from auth.users where id in (select id from c1_synthetic);
create table puzzle_id_cutover_backup.cutover_info as select now() as taken_at;
create table puzzle_id_cutover_backup.genuine_user_ids as
  select id from auth.users where id not in (select id from c1_synthetic);

-- ------------------------------------------------------------
-- 2. Clear gameplay data. TRUNCATE fires no row triggers, so no stats
--    rebuilds run while clearing.
-- ------------------------------------------------------------
truncate public.game_records, public.puzzle_stats;
delete from public.player_stats;
delete from public.players where id in (select id from c1_synthetic);
delete from auth.users     where id in (select id from c1_synthetic);

-- ------------------------------------------------------------
-- 3. Plays belong to a puzzle.
-- ------------------------------------------------------------
alter table public.game_records add column puzzle_id text not null;
alter table public.game_records
  add constraint game_records_puzzle_id_fkey
  foreign key (puzzle_id) references public.games (id) on delete restrict;
alter table public.game_records
  add constraint game_records_player_puzzle_key unique (player_id, puzzle_id);
create index game_records_puzzle_completed_idx on public.game_records (puzzle_id) where completed;
comment on column public.game_records.puzzle_id is 'The puzzle (games.id) this play belongs to. Permanent.';
comment on column public.game_records.game_date is 'Snapshot of the puzzle''s scheduled date when the play started. Display only, never a key.';

-- ------------------------------------------------------------
-- 4. One stats row per puzzle.
-- ------------------------------------------------------------
alter table public.puzzle_stats drop constraint puzzle_stats_pkey;
alter table public.puzzle_stats alter column game_date drop not null;
alter table public.puzzle_stats add column puzzle_id text not null;
alter table public.puzzle_stats add constraint puzzle_stats_pkey primary key (puzzle_id);
alter table public.puzzle_stats
  add constraint puzzle_stats_puzzle_id_fkey
  foreign key (puzzle_id) references public.games (id) on delete cascade;
comment on column public.puzzle_stats.game_date is 'TEMPORARY: the puzzle''s date while published, for the previous app''s by-date reads. Dropped by C2.';

-- ------------------------------------------------------------
-- 5. Puzzles: one published puzzle per date; known statuses only.
-- ------------------------------------------------------------
create unique index games_one_published_per_date on public.games (date) where status = 'published';
alter table public.games
  add constraint games_status_check check (status in ('draft', 'published', 'retired'));
alter table public.games
  add constraint games_published_date_iso check (status <> 'published' or date ~ '^\d{4}-\d{2}-\d{2}$');

-- ------------------------------------------------------------
-- 6. Functions and triggers.
-- ------------------------------------------------------------

-- Fills puzzle_id / game_date on a new play and keeps a play on its puzzle.
-- C1 version: also accepts the previous app's by-date saves.
create or replace function public.game_records_assign_puzzle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  match_count integer;
  match_id text;
  match_title text;
begin
  if tg_op = 'UPDATE' then
    -- A play never moves to another puzzle.
    new.puzzle_id := old.puzzle_id;
    return new;
  end if;

  if new.puzzle_id is null then
    -- Previous app: only a date was sent. Use the one published puzzle on
    -- that date, and only if it is the puzzle the player was shown.
    select count(*), min(g.id), min(g.theme_title)
      into match_count, match_id, match_title
    from public.games g
    where g.status = 'published' and g.date = new.game_date;
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

create trigger game_records_assign_puzzle
before insert or update on public.game_records
for each row
execute function public.game_records_assign_puzzle();

-- Rebuilds one puzzle's stats row from its completed plays.
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

  -- One rebuild of a puzzle at a time: a second finish waits here until the
  -- first commits, then counts both. Without this, two simultaneous
  -- finishes could collide and roll back the later player's save.
  perform pg_advisory_xact_lock(hashtext('puzzle_stats:' || target_puzzle_id));

  delete from public.puzzle_stats where puzzle_id = target_puzzle_id;

  insert into public.puzzle_stats (
    puzzle_id,
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
    (select case when g.status = 'published' then g.date::date end
       from public.games g where g.id = target_puzzle_id),
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

-- Rebuilds every puzzle's stats.
create or replace function public.rebuild_puzzle_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid text;
begin
  delete from public.puzzle_stats ps
   where not exists (select 1 from public.game_records r
                      where r.completed and r.puzzle_id = ps.puzzle_id);
  for pid in
    select distinct puzzle_id from public.game_records where completed order by 1
  loop
    perform public.rebuild_puzzle_stats_for(pid);
  end loop;
end;
$$;

-- Rebuilds the affected puzzle when a play is finished, changed or deleted.
-- Bulk scripts may set wtf.defer_stats = on for their own transaction and
-- rebuild once at the end.
create or replace function public.handle_completed_game_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('wtf.defer_stats', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    if old.completed then
      perform public.rebuild_puzzle_stats_for(old.puzzle_id);
    end if;
    return null;
  end if;

  if tg_op = 'UPDATE' and old.completed and not new.completed then
    perform public.rebuild_puzzle_stats_for(old.puzzle_id);
  elsif new.completed and (
       tg_op = 'INSERT'
       or not coalesce(old.completed, false)
       or old.score is distinct from new.score
       or old.answers is distinct from new.answers
       or old.total_questions is distinct from new.total_questions
     ) then
    perform public.rebuild_puzzle_stats_for(new.puzzle_id);
  end if;
  return null;
end;
$$;

drop trigger if exists game_records_completed_stats on public.game_records;
create trigger game_records_completed_stats
after insert or update or delete on public.game_records
for each row
execute function public.handle_completed_game_record();

-- TEMPORARY (dropped by C2): keeps each stats row's date equal to its
-- puzzle's date while published, empty otherwise.
create or replace function public.games_sync_puzzle_stats_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.puzzle_stats
     set game_date = case when new.status = 'published' then new.date::date end
   where puzzle_id = new.id;
  return null;
end;
$$;

create trigger games_sync_puzzle_stats_date
after update of date, status on public.games
for each row
execute function public.games_sync_puzzle_stats_date();

-- The by-date stats functions are replaced by the ones above. The unused
-- leftover apply_completed_game_to_puzzle_stats (not in the repo, called by
-- nothing) would fail against the new key, so it goes too.
drop function if exists public.rebuild_single_puzzle_stats(date);
drop function if exists public.apply_completed_game_to_puzzle_stats(public.game_records);

-- Only the database itself runs these (triggers don't need the grant).
revoke execute on function public.game_records_assign_puzzle()     from public, anon, authenticated;
revoke execute on function public.rebuild_puzzle_stats_for(text)   from public, anon, authenticated;
revoke execute on function public.rebuild_puzzle_stats()           from public, anon, authenticated;
revoke execute on function public.handle_completed_game_record()   from public, anon, authenticated;
revoke execute on function public.games_sync_puzzle_stats_date()   from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. Checks. Any failure undoes all of C1.
-- ------------------------------------------------------------
do $$
begin
  -- Every genuine account and player is still there (new guests signing
  -- in meanwhile are fine).
  if exists (select 1 from puzzle_id_cutover_backup.genuine_user_ids b
              where not exists (select 1 from auth.users u where u.id = b.id)) then
    raise exception 'C1 check failed: a genuine auth user is missing.';
  end if;
  if exists (select 1 from puzzle_id_cutover_backup.players b
              where b.id in (select id from puzzle_id_cutover_backup.genuine_user_ids)
                and not exists (select 1 from public.players p where p.id = b.id)) then
    raise exception 'C1 check failed: a genuine player is missing.';
  end if;
  if exists (select 1 from puzzle_id_cutover_backup.games b
              where not exists (select 1 from public.games g where g.id = b.id)) then
    raise exception 'C1 check failed: a puzzle is missing.';
  end if;
  if exists (select 1 from public.game_records) or exists (select 1 from public.puzzle_stats)
     or exists (select 1 from public.player_stats) then
    raise exception 'C1 check failed: gameplay tables are not empty.';
  end if;
  if exists (select 1 from auth.users where email like 'results\_test\_player\_%@example.invalid' escape '\') then
    raise exception 'C1 check failed: synthetic users remain.';
  end if;
end $$;

commit;

-- 8. Report (read-only).
select (select count(*) from puzzle_id_cutover_backup.game_records)    as plays_cleared,
       (select count(*) from puzzle_id_cutover_backup.puzzle_stats)    as stats_rows_cleared,
       (select count(*) from puzzle_id_cutover_backup.player_stats)    as player_stats_cleared,
       (select count(*) from puzzle_id_cutover_backup.synthetic_users) as synthetic_users_removed,
       (select count(*) from public.players)                           as genuine_players_kept,
       (select count(*) from public.games)                             as puzzles_kept;
