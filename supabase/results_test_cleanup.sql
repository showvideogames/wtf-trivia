-- ============================================================
-- results_test_ : REMOVE SYNTHETIC RESULTS-SCREEN DATA
--
-- Deletes only what supabase/results_test_seed.sql created, then rebuilds
-- puzzle_stats for the affected puzzles from the remaining (genuine) records.
-- The rebuild is explicit because the stats trigger only fires on insert and
-- update, never on delete.
--
-- A row is treated as synthetic only when BOTH hold:
--   email = results_test_player_NN@example.invalid
--   id    = md5('results_test_player_NN')::uuid
--
-- Run in the Supabase SQL Editor. Safe to rerun.
-- ============================================================

begin;

create temp table rt_ids on commit drop as
select u.id from auth.users u
where u.email like 'results\_test\_player\_%@example.invalid' escape '\'
  and u.id = md5(split_part(u.email, '@', 1))::uuid
union
select p.id from public.players p
where p.email like 'results\_test\_player\_%@example.invalid' escape '\'
  and p.id = md5(split_part(p.email, '@', 1))::uuid;

create temp table rt_dates on commit drop as
select distinct game_date::date as game_date from public.game_records
where player_id in (select id from rt_ids);

delete from public.game_records where player_id in (select id from rt_ids);
delete from public.player_stats where player_id in (select id from rt_ids);
delete from public.players      where id        in (select id from rt_ids);
delete from auth.users          where id        in (select id from rt_ids);

select public.rebuild_single_puzzle_stats(game_date) from rt_dates;

commit;

select count(*) as synthetic_rows_remaining
from public.game_records
where player_id in (
  select md5('results_test_player_' || lpad(k::text, 2, '0'))::uuid from generate_series(1, 50) k
);
