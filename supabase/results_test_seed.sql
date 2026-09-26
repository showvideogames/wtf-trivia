-- ============================================================
-- results_test_ : SYNTHETIC RESULTS-SCREEN DATA (PRE-LAUNCH ONLY)
--
-- Adds 50 synthetic players and one completed first-attempt play per player
-- for every published puzzle, so the Results screen's community stats
-- (Average Chaos, Crowd Showdown, Perfect Goblins, Nerd Mode) have realistic
-- numbers to show.
--
--   Run:     paste into the Supabase SQL Editor and run once.
--   Rerun:   safe. Existing synthetic rows are skipped, never duplicated.
--            A puzzle published since the last run gets its 50 plays.
--   Check:   supabase/results_test_verify.sql (read-only).
--   Remove:  supabase/results_test_cleanup.sql
--
-- Marker: every synthetic auth user / player has the email
--   results_test_player_NN@example.invalid   (NN = 01..50)
-- and the id md5('results_test_player_NN')::uuid. No passwords are set,
-- so none of them can sign in.
--
-- Aggregates are produced by the production trigger
-- (game_records_completed_stats -> rebuild_single_puzzle_stats), exactly as
-- a real completion does. The script aborts, changing nothing, if:
--   * any stored puzzle_stats row can't be reproduced from game_records
--     (rebuilding would otherwise overwrite figures that can't be recreated),
--   * a published puzzle date is ambiguous or has a malformed question,
--   * a synthetic id is already taken by a non-synthetic user,
--   * the trigger did not update puzzle_stats after the insert.
--
-- Generation is fully deterministic (md5-derived, no random()), so every run
-- against the same puzzles produces the same dataset.
-- ============================================================

begin;

-- Live columns may store dates as text or date and JSON as json or jsonb, so
-- every stored value is cast explicitly. ISO output keeps any date written
-- into a text column in the app's own YYYY-MM-DD form.
set local datestyle = 'ISO, YMD';

-- 0. Refuse to run if rebuilding stats would change any stored figures.
do $$
declare
  d date;
  before_row jsonb;
  after_row jsonb;
  drifted text := '';
begin
  for d in
    select game_date::date from public.puzzle_stats
    union
    select distinct game_date::date from public.game_records where completed
  loop
    select to_jsonb(ps) - 'updated_at' into before_row
      from public.puzzle_stats ps where ps.game_date::date = d;
    begin
      perform public.rebuild_single_puzzle_stats(d);
      select to_jsonb(ps) - 'updated_at' into after_row
        from public.puzzle_stats ps where ps.game_date::date = d;
      raise exception 'results_test_probe';  -- always undo the probe rebuild
    exception when raise_exception then
      if sqlerrm <> 'results_test_probe' then raise; end if;
    end;
    if before_row is distinct from after_row then
      drifted := drifted || ' ' || d;
    end if;
  end loop;
  if drifted <> '' then
    raise exception 'results_test seed aborted: puzzle_stats for% cannot be reproduced from game_records.', drifted;
  end if;
end $$;

-- 1. Target puzzles: every published puzzle with questions.
create temp table rt_puzzles on commit drop as
select g.id::text as id, g.date::date as date, g.theme_title, g.questions::jsonb as questions,
       jsonb_array_length(g.questions::jsonb) as n
from public.games g
where g.status = 'published'
  and case when jsonb_typeof(g.questions::jsonb) = 'array'
           then jsonb_array_length(g.questions::jsonb) > 0 end;

do $$
declare bad text;
begin
  select string_agg(date::text, ', ') into bad
  from (select date from rt_puzzles group by date having count(*) > 1) x;
  if bad is not null then
    raise exception 'results_test seed aborted: more than one published puzzle on %', bad;
  end if;

  select string_agg(p.id || ' Q' || q.ord, ', ') into bad
  from rt_puzzles p
  cross join lateral jsonb_array_elements(p.questions) with ordinality q(elem, ord)
  where coalesce(q.elem ->> 'correctCategory', '') not in ('A', 'B');
  if bad is not null then
    raise exception 'results_test seed aborted: questions without correctCategory A/B: %', bad;
  end if;
end $$;

-- 2. The 50 synthetic players. skill spreads evenly from -0.20 to +0.20.
create temp table rt_players on commit drop as
select k,
       md5('results_test_player_' || lpad(k::text, 2, '0'))::uuid as id,
       'results_test_player_' || lpad(k::text, 2, '0') || '@example.invalid' as email,
       -0.20 + 0.40 * (k - 1) / 49.0 as skill
from generate_series(1, 50) k;

do $$
declare bad text;
begin
  select string_agg(u.id::text, ', ') into bad
  from auth.users u join rt_players p on p.id = u.id
  where u.email is distinct from p.email;
  if bad is not null then
    raise exception 'results_test seed aborted: synthetic ids already used by other auth users: %', bad;
  end if;

  select string_agg(u.email, ', ') into bad
  from auth.users u join rt_players p on p.email = u.email
  where u.id <> p.id;
  if bad is not null then
    raise exception 'results_test seed aborted: marker emails already used by other accounts: %', bad;
  end if;
end $$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated',
       p.email, '',
       '{"provider":"results_test","providers":["results_test"]}'::jsonb,
       '{"results_test":true}'::jsonb,
       (select min(date) from rt_puzzles)::timestamptz - interval '1 day' + p.k * interval '7 minutes',
       (select min(date) from rt_puzzles)::timestamptz - interval '1 day' + p.k * interval '7 minutes',
       '', '', '', ''
from rt_players p
on conflict (id) do nothing;

-- If a trigger outside this repo already created a bare players row for a
-- synthetic id, stamp the marker email on it. Only synthetic ids reach here:
-- the guard above proved these auth users are ours.
insert into public.players (id, email, is_guest, created_at, last_seen_at)
select p.id, p.email, true, u.created_at, u.created_at
from rt_players p join auth.users u on u.id = p.id
on conflict (id) do update set email = excluded.email
  where public.players.email is null;

-- 3. Per-question difficulty. Questions are shuffled per puzzle and split
--    into bands by position: first 30% hard (36-50% correct),
--    next 40% medium (55-70%), rest easy (75-90%).
create temp table rt_questions on commit drop as
with ranked as (
  select p.id as game_id, p.date, p.n, q.ord - 1 as idx,
         q.elem ->> 'correctCategory' as correct_cat,
         (row_number() over (partition by p.date order by md5(p.id || ':band:' || (q.ord - 1))) - 1)::numeric / p.n as pos
  from rt_puzzles p
  cross join lateral jsonb_array_elements(p.questions) with ordinality q(elem, ord)
)
select r.*,
       round(50 * (
         case when r.pos < 0.3 then 0.36 + 0.14 * u
              when r.pos < 0.7 then 0.55 + 0.15 * u
              else 0.75 + 0.15 * u end
       ))::int as target_correct
from ranked r
cross join lateral (
  select ('x' || substr(md5(r.game_id || ':rate:' || r.idx), 1, 8))::bit(32)::bigint / 4294967296.0 as u
) h;

-- 4. One or two designated perfect players per puzzle, from the stronger half
--    (a few more reach a perfect score naturally, mostly on short puzzles).
create temp table rt_perfect on commit drop as
select game_id, player_id
from (
  select p.id as game_id, pl.id as player_id,
         row_number() over (partition by p.id order by md5(p.id || ':perfect:' || pl.k)) as rn,
         1 + (('x' || substr(md5(p.id || ':nperfect'), 1, 8))::bit(32)::bigint % 2) as nperfect
  from rt_puzzles p cross join rt_players pl
  where pl.k > 25
) x
where rn <= nperfect;

-- 5. Who answered each question correctly. Perfect players get every
--    question; the rest of each question's quota goes to the highest
--    skill + per-question noise, so no two questions share a winner set.
create temp table rt_cells on commit drop as
with scored as (
  select q.game_id, q.date, q.idx, q.correct_cat, q.target_correct, pl.id as player_id,
         (pf.player_id is not null) as is_perfect,
         pl.skill + 0.8 * ((('x' || substr(md5(q.game_id || ':' || q.idx || ':' || pl.k), 1, 8))::bit(32)::bigint / 4294967296.0) - 0.5) as strength
  from rt_questions q
  cross join rt_players pl
  left join rt_perfect pf on pf.game_id = q.game_id and pf.player_id = pl.id
),
ranked as (
  select s.*,
         row_number() over (partition by s.game_id, s.idx, s.is_perfect order by s.strength desc) as rnk,
         count(*) filter (where s.is_perfect) over (partition by s.game_id, s.idx) as nperfect
  from scored s
)
select game_id, date, idx, correct_cat, player_id,
       (is_perfect or rnk <= target_correct - nperfect) as correct
from ranked;

-- 6. One completed first-attempt record per player per puzzle, in the exact
--    shape GameScreen writes: [{questionIndex, chosenCategory, correct}].
insert into public.game_records (
  player_id, game_date, theme_title, score, total_questions, answers,
  completed, started_at, completed_at
)
select c.player_id, c.date, p.theme_title,
       count(*) filter (where c.correct)::int,
       p.n,
       jsonb_agg(jsonb_build_object(
         'questionIndex', c.idx,
         'chosenCategory', case when c.correct then c.correct_cat
                                when c.correct_cat = 'A' then 'B' else 'A' end,
         'correct', c.correct
       ) order by c.idx),
       true,
       t.completed_at - (90 + 420 * t.u2) * interval '1 second',
       t.completed_at
from rt_cells c
join rt_puzzles p on p.id = c.game_id
cross join lateral (
  -- Finished between 12:00 and 03:00 UTC on the puzzle's own day, and never
  -- in the future when the puzzle is today's.
  select (p.date + time '12:00') at time zone 'UTC' + greatest(
           least(interval '15 hours', now() - ((p.date + time '12:00') at time zone 'UTC')),
           interval '15 minutes'
         ) * (('x' || substr(md5(p.id || ':done:' || c.player_id), 1, 8))::bit(32)::bigint / 4294967296.0)
           as completed_at,
         ('x' || substr(md5(p.id || ':took:' || c.player_id), 1, 8))::bit(32)::bigint / 4294967296.0 as u2
) t
group by c.player_id, c.date, p.theme_title, p.n, t.completed_at, t.u2
on conflict (player_id, game_date) do nothing;

-- 7. Confirm the production trigger rebuilt puzzle_stats for every puzzle.
do $$
declare bad text;
begin
  select string_agg(p.date::text, ', ') into bad
  from rt_puzzles p
  left join public.puzzle_stats ps on ps.game_date::date = p.date
  where coalesce(ps.total_finished, -1) <> (
    select count(*) from public.game_records r where r.completed and r.game_date::date = p.date
  );
  if bad is not null then
    raise exception 'results_test seed aborted: puzzle_stats was not rebuilt for %', bad;
  end if;
end $$;

commit;

select count(distinct r.player_id) as synthetic_players,
       count(*) as synthetic_completed_plays,
       count(distinct r.game_date) as puzzles_covered
from public.game_records r
where r.player_id in (
  select md5('results_test_player_' || lpad(k::text, 2, '0'))::uuid from generate_series(1, 50) k
);
