-- ============================================================
-- PUZZLE-ID CUTOVER :: VERIFICATION  —  READ-ONLY
--
-- Every query is READ-ONLY (SELECT and catalog reads). Run one block at a
-- time in the Supabase SQL Editor.
--
--   V0  before anything: the starting point
--   V1  before AND after L1 (security lockdown): compare with the expected columns
--   V2  after C1, again after the new app is live, and again after C2
--
-- V2 returns rows of (n, check_name, ok, detail); every ok must be true. Rows marked "info" report facts rather than pass/fail.
-- ============================================================


-- ===== V0  READ-ONLY: before anything =====
select
  (select count(*) from public.games)                                                   as puzzles,
  (select string_agg(status || ' x' || n, ', ') from (select status, count(*) n from public.games group by 1) s) as statuses,
  (select count(*) from (select date from public.games where status = 'published' group by 1 having count(*) > 1) x) as published_date_collisions,
  (select count(*) from auth.users
    where email like 'results\_test\_player\_%@example.invalid' escape '\'
      and id = md5(split_part(email, '@', 1))::uuid)                                    as synthetic_users,
  (select count(*) from auth.users
    where email like 'results\_test\_player\_%@example.invalid' escape '\'
      and id <> md5(split_part(email, '@', 1))::uuid)                                   as marker_emails_on_other_ids,
  (select count(*) from public.players)                                                 as players_total,
  (select count(*) from public.game_records)                                            as plays,
  (select count(*) from public.puzzle_stats)                                            as stats_rows,
  (select count(*) from public.player_stats)                                            as player_stats_rows,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'game_records' and column_name = 'puzzle_id') as c1_applied,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('players', 'game_records', 'player_stats')
      and 'public' = any(roles))                                                        as permissive_policies_open;


-- ===== V1  READ-ONLY: run BEFORE and AFTER L1 (security lockdown) =====
-- Compare "found" with expected_before (first run) and expected_after
-- (after L1). Rows 1 and 3 must drop to 0; rows 2, 4 and 5 must not change.
select * from (
  select 1 as n,
         'permissive "anyone" policies on players, game_records, player_stats' as check_name,
         (select count(*) from pg_policies where schemaname = 'public'
            and tablename in ('players', 'game_records', 'player_stats') and 'public' = any(roles)) as found,
         8 as expected_before, 0 as expected_after,
         (select string_agg(tablename || ': ' || policyname, ' | ' order by tablename, policyname) from pg_policies
           where schemaname = 'public' and tablename in ('players', 'game_records', 'player_stats')
             and 'public' = any(roles)) as detail
  union all
  select 2, 'own-rows-only policies on players, game_records, player_stats (must stay)',
         (select count(*) from pg_policies where schemaname = 'public'
            and tablename in ('players', 'game_records', 'player_stats')
            and (coalesce(qual, '') ~ 'uid\(\)' or coalesce(with_check, '') ~ 'uid\(\)')),
         9, 9,
         (select string_agg(tablename || ': ' || policyname, ' | ' order by tablename, policyname) from pg_policies
           where schemaname = 'public' and tablename in ('players', 'game_records', 'player_stats')
             and (coalesce(qual, '') ~ 'uid\(\)' or coalesce(with_check, '') ~ 'uid\(\)'))
  union all
  select 3, 'stats functions that visitors or players can call directly',
         (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('rebuild_single_puzzle_stats', 'rebuild_puzzle_stats', 'rebuild_puzzle_stats_for',
                              'handle_completed_game_record', 'apply_completed_game_to_puzzle_stats',
                              'game_records_assign_puzzle', 'games_sync_puzzle_stats_date')
            and (has_function_privilege('anon', p.oid, 'execute')
                 or has_function_privilege('authenticated', p.oid, 'execute'))),
         4, 0,
         (select string_agg(p.proname, ' | ' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('rebuild_single_puzzle_stats', 'rebuild_puzzle_stats', 'rebuild_puzzle_stats_for',
                              'handle_completed_game_record', 'apply_completed_game_to_puzzle_stats',
                              'game_records_assign_puzzle', 'games_sync_puzzle_stats_date')
            and (has_function_privilege('anon', p.oid, 'execute')
                 or has_function_privilege('authenticated', p.oid, 'execute')))
  union all
  select 4, 'row level security switched on (players, game_records, player_stats)',
         (select count(*) from pg_class where relrowsecurity
            and oid in ('public.players'::regclass, 'public.game_records'::regclass, 'public.player_stats'::regclass)),
         3, 3, null
  union all
  select 5, 'NOT FIXED BY L1: puzzle (games) policies open to everyone (follow-up)',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'games'),
         7, 7,
         (select string_agg(policyname || ' [' || cmd || ']', ' | ' order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'games')
) v order by n;


-- ===== V2  READ-ONLY: after C1 (and after the app deploy, and after C2) =====
with rec as (
  select r.puzzle_id, r.score, r.total_questions, r.answers
  from public.game_records r where r.completed
),
base as (
  select puzzle_id, count(*)::int as finished, coalesce(sum(score), 0)::int as score_sum,
         count(*) filter (where total_questions > 0 and score = total_questions)::int as perfect,
         coalesce(max(total_questions), 0)::int as total_questions
  from rec group by puzzle_id
),
per_q as (
  select b.puzzle_id, i.idx, count(a.elem)::int as answered,
         count(*) filter (where coalesce((a.elem ->> 'correct')::boolean, false))::int as correct
  from base b
  cross join lateral generate_series(0, greatest(b.total_questions - 1, 0)) i(idx)
  left join rec r on r.puzzle_id = b.puzzle_id
  left join lateral (select elem from jsonb_array_elements(r.answers) with ordinality arr(elem, ord)
                      where ord = i.idx + 1) a on true
  group by b.puzzle_id, i.idx
),
recomputed as (
  select b.*,
         case when b.total_questions > 0 then (select jsonb_agg(q.correct order by q.idx) from per_q q where q.puzzle_id = b.puzzle_id) else '[]'::jsonb end as correct_counts,
         case when b.total_questions > 0 then (select jsonb_agg(q.answered order by q.idx) from per_q q where q.puzzle_id = b.puzzle_id) else '[]'::jsonb end as answer_counts,
         (select jsonb_object_agg(score::text, c) from (select score, count(*) c from rec where rec.puzzle_id = b.puzzle_id group by score) h) as histogram
  from base b
),
mismatch as (
  select coalesce(ps.puzzle_id, rc.puzzle_id) as puzzle_id
  from public.puzzle_stats ps
  full join recomputed rc on rc.puzzle_id = ps.puzzle_id
  where (ps.total_finished, ps.total_score, ps.perfect_count, ps.total_questions)
          is distinct from (rc.finished, rc.score_sum, rc.perfect, rc.total_questions)
     or ps.question_correct_counts is distinct from rc.correct_counts
     or ps.question_answer_counts is distinct from rc.answer_counts
     or ps.score_histogram is distinct from rc.histogram
)
select * from (
  select 1 as n, 'every play belongs to a puzzle (puzzle_id required, linked to games)' as check_name,
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_records'
                   and column_name = 'puzzle_id' and is_nullable = 'NO')
         and exists (select 1 from pg_constraint where conname = 'game_records_puzzle_id_fkey' and convalidated
                       and pg_get_constraintdef(oid) ilike '%on delete restrict%') as ok,
         null::text as detail
  union all
  select 2, 'one play per player per puzzle',
         exists (select 1 from pg_constraint where conname = 'game_records_player_puzzle_key'
                   and pg_get_constraintdef(oid) = 'UNIQUE (player_id, puzzle_id)'),
         null
  union all
  select 3, 'one stats row per puzzle',
         exists (select 1 from pg_constraint where conrelid = 'public.puzzle_stats'::regclass
                   and contype = 'p' and pg_get_constraintdef(oid) = 'PRIMARY KEY (puzzle_id)'),
         null
  union all
  select 4, 'at most one published puzzle per date (enforced)',
         exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'games_one_published_per_date')
         and not exists (select 1 from public.games where status = 'published' group by date having count(*) > 1),
         null
  union all
  select 5, 'stats rebuilt on insert, update and delete of a play',
         exists (select 1 from pg_trigger where tgname = 'game_records_completed_stats'
                   and pg_get_triggerdef(oid) ~* 'insert' and pg_get_triggerdef(oid) ~* 'update'
                   and pg_get_triggerdef(oid) ~* 'delete'),
         null
  union all
  select 6, 'every stats row equals a fresh count of its puzzle''s finished plays',
         not exists (select 1 from mismatch),
         (select string_agg(puzzle_id, ', ') from mismatch)
  union all
  select 7, 'info: synthetic test users (0 right after C1; 50 after a deliberate reseed)',
         true,
         (select count(*) || ' synthetic users' from auth.users where email like 'results\_test\_player\_%@example.invalid' escape '\')
  union all
  select 8, 'every genuine account and player from before the cutover still exists',
         not exists (select 1 from puzzle_id_cutover_backup.genuine_user_ids b
                      where not exists (select 1 from auth.users u where u.id = b.id))
         and not exists (select 1 from puzzle_id_cutover_backup.players b
                          where b.id in (select id from puzzle_id_cutover_backup.genuine_user_ids)
                            and not exists (select 1 from public.players p where p.id = b.id)),
         (select count(*) || ' players now' from public.players)
  union all
  select 9, 'every puzzle from before the cutover still exists',
         not exists (select 1 from puzzle_id_cutover_backup.games b where not exists (select 1 from public.games g where g.id = b.id)),
         (select count(*) || ' puzzles now' from public.games)
  union all
  select 10, 'anonymous visitors cannot call any stats function',
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and p.proname in ('rebuild_puzzle_stats', 'rebuild_puzzle_stats_for', 'handle_completed_game_record',
                                         'game_records_assign_puzzle', 'games_sync_puzzle_stats_date')
                       and (has_function_privilege('anon', p.oid, 'execute')
                            or has_function_privilege('authenticated', p.oid, 'execute'))),
         null
  union all
  select 11, 'info: plays since the cutover',
         true,
         (select count(*) || ' plays (' || count(*) filter (where completed) || ' finished) on '
                 || count(distinct puzzle_id) || ' puzzles' from public.game_records)
  union all
  select 12, 'info: C2 applied (date rule and stats date copy removed)',
         true,
         (not exists (select 1 from pg_constraint where conname = 'game_records_player_id_game_date_key')
          and not exists (select 1 from information_schema.columns where table_schema = 'public'
                            and table_name = 'puzzle_stats' and column_name = 'game_date'))::text
) v order by n;
