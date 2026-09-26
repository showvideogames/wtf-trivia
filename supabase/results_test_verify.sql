-- ============================================================
-- results_test_ : READ-ONLY VERIFICATION
--
-- One row per published puzzle. Changes nothing. Run before and after
-- results_test_seed.sql: genuine_* columns (and genuine_checksum) must be
-- identical both times; every *_ok column must be true after seeding.
--
-- Dates and JSON are cast explicitly because the live columns store dates as
-- text in some tables and as date in others. The first row's live_schema
-- column reports those column types, the stats function and the triggers.
-- ============================================================

with syn as (
  select md5('results_test_player_' || lpad(k::text, 2, '0'))::uuid as id
  from generate_series(1, 50) k
),
pub as (
  select id::text as id, date::date as date, theme_title, questions::jsonb as questions,
         jsonb_array_length(questions::jsonb) as n
  from public.games
  where status = 'published'
    and case when jsonb_typeof(questions::jsonb) = 'array'
             then jsonb_array_length(questions::jsonb) > 0 end
),
rec as (
  select r.player_id::uuid as player_id, r.game_date::date as game_date,
         r.score, r.total_questions, r.answers::jsonb as answers, r.completed,
         (r.player_id::uuid in (select id from syn)) as is_syn,
         r::text as row_text
  from public.game_records r
),
-- Every answer checked against the puzzle's real answer key.
ans as (
  select r.player_id, r.game_date, r.is_syn, r.completed,
         a.ord - 1 as idx, a.elem,
         (a.elem ->> 'correct')::boolean as correct,
         (a.elem ->> 'questionIndex')::int = a.ord - 1
           and a.elem ->> 'chosenCategory' in ('A', 'B')
           and ((a.elem ->> 'chosenCategory') = (p.questions -> (a.ord - 1)::int ->> 'correctCategory'))
               = (a.elem ->> 'correct')::boolean as well_formed
  from rec r
  join pub p on p.date = r.game_date
  cross join lateral jsonb_array_elements(r.answers) with ordinality a(elem, ord)
),
syn_q as (
  select game_date, idx, round(100.0 * count(*) filter (where correct) / count(*)) as pct
  from ans where is_syn group by game_date, idx
),
all_q as (
  select game_date,
         jsonb_agg(c order by idx) as correct_counts,
         jsonb_agg(t order by idx) as answer_counts
  from (
    select game_date, idx, count(*) filter (where correct) as c, count(*) as t
    from ans where completed group by game_date, idx
  ) x group by game_date
),
per as (
  select p.date, p.id, p.theme_title, p.n,
         count(r.*) filter (where r.is_syn and r.completed) as syn_plays,
         count(r.*) filter (where r.is_syn and not r.completed) as syn_incomplete,
         min(r.score) filter (where r.is_syn) as syn_min,
         round(avg(r.score) filter (where r.is_syn), 2) as syn_avg,
         max(r.score) filter (where r.is_syn) as syn_max,
         count(*) filter (where r.is_syn and r.score = p.n) as syn_perfect,
         count(*) filter (where r.is_syn and (r.total_questions <> p.n or jsonb_array_length(r.answers) <> p.n)) as syn_bad_length,
         count(*) filter (where r.is_syn and r.score <> (
           select count(*) from jsonb_array_elements(r.answers) e where (e ->> 'correct')::boolean
         )) as syn_bad_score,
         count(r.*) filter (where not r.is_syn) as genuine_rows,
         count(r.*) filter (where not r.is_syn and r.completed) as genuine_completed,
         count(*) filter (where r.completed) as all_completed,
         coalesce(sum(r.score) filter (where r.completed), 0) as all_score,
         count(*) filter (where r.completed and r.total_questions > 0 and r.score = r.total_questions) as all_perfect,
         (select jsonb_object_agg(score, c) from (
            select score, count(*) c from rec
            where completed and rec.game_date = p.date group by score
          ) h) as all_histogram,
         md5(coalesce(string_agg(r.row_text, '|' order by r.player_id) filter (where not r.is_syn), '')) as genuine_checksum
  from pub p
  left join rec r on r.game_date = p.date
  group by p.date, p.id, p.theme_title, p.n
),
live_schema as (
  select concat_ws(' ; ',
    (select string_agg(table_name || '.' || column_name || ':' || data_type, ', ' order by table_name, column_name)
       from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (
          ('games', 'id'), ('games', 'date'), ('games', 'questions'), ('games', 'status'),
          ('game_records', 'player_id'), ('game_records', 'game_date'), ('game_records', 'answers'),
          ('game_records', 'score'), ('game_records', 'total_questions'), ('game_records', 'completed'),
          ('game_records', 'started_at'), ('game_records', 'completed_at'),
          ('players', 'id'), ('players', 'email'), ('players', 'is_guest'),
          ('puzzle_stats', 'game_date'), ('puzzle_stats', 'question_correct_counts'),
          ('puzzle_stats', 'question_answer_counts'), ('puzzle_stats', 'score_histogram'))),
    'rebuild_fn(' || (select string_agg(pg_get_function_identity_arguments(oid), ' | ')
                        from pg_proc where proname = 'rebuild_single_puzzle_stats'
                          and pronamespace = 'public'::regnamespace) || ')',
    'triggers: ' || (select string_agg(tgname, ', ') from pg_trigger
                      where tgrelid = 'public.game_records'::regclass and not tgisinternal),
    'auth_user_triggers: ' || coalesce((select string_agg(tgname, ', ') from pg_trigger
                      where tgrelid = 'auth.users'::regclass and not tgisinternal), 'none')
  ) as info
)
select per.date, per.id, per.theme_title, per.n as questions,
       per.syn_plays, per.syn_min, per.syn_avg, per.syn_max, per.syn_perfect,
       (select min(pct) from syn_q where syn_q.game_date = per.date) as syn_q_min_pct,
       (select max(pct) from syn_q where syn_q.game_date = per.date) as syn_q_max_pct,
       (select string_agg(pct::text, ' ' order by idx) from syn_q where syn_q.game_date = per.date) as syn_q_pcts,
       per.genuine_rows, per.genuine_completed,
       ps.total_finished, ps.total_score, ps.perfect_count,
       -- What the Results screen shows (same arithmetic as dbGetPuzzleCommunityStats)
       case when ps.total_finished > 0 then round(ps.total_score::numeric / ps.total_finished) end as shown_avg_score,
       case when ps.total_finished > 0 then round(100.0 * ps.perfect_count / ps.total_finished) end as shown_perfect_pct,
       per.syn_plays = 50 and per.syn_incomplete = 0 as plays_ok,
       per.syn_bad_length = 0 as lengths_ok,
       per.syn_bad_score = 0 as scores_ok,
       not exists (select 1 from ans where ans.game_date = per.date and ans.is_syn and not ans.well_formed) as answers_ok,
       ps.total_finished = per.all_completed
         and ps.total_score = per.all_score
         and ps.perfect_count = per.all_perfect
         and ps.score_histogram::jsonb = coalesce(per.all_histogram, '{}'::jsonb)
         and ps.question_correct_counts::jsonb = aq.correct_counts
         and ps.question_answer_counts::jsonb = aq.answer_counts as stats_ok,
       per.genuine_checksum,
       case when row_number() over (order by per.date) = 1 then (select info from live_schema) end as live_schema
from per
left join public.puzzle_stats ps on ps.game_date::date = per.date
left join all_q aq on aq.game_date = per.date
order by per.date;
