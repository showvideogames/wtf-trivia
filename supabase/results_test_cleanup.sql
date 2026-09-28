-- ============================================================
-- results_test_ : REMOVE SYNTHETIC RESULTS-SCREEN DATA
--
-- Deletes only what supabase/results_test_seed.sql created, then rebuilds
-- puzzle_stats for the affected puzzles from the remaining (genuine) plays.
-- The per-row stats rebuild is switched off while deleting (wtf.defer_stats)
-- and each affected puzzle is rebuilt once at the end instead.
--
-- A row is treated as synthetic only when BOTH hold:
--   email = results_test_player_NN@example.invalid
--   id    = md5('results_test_player_NN')::uuid
-- Genuine players and accounts are never touched.
--
-- Run in the Supabase SQL Editor. Safe to rerun.
-- ============================================================

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'game_records' and column_name = 'puzzle_id') then
    raise exception 'results_test cleanup aborted: this version needs the puzzle-id cutover (C1).';
  end if;
end $$;

set local wtf.defer_stats = 'on';

create temp table rt_ids on commit drop as
select u.id from auth.users u
where u.email like 'results\_test\_player\_%@example.invalid' escape '\'
  and u.id = md5(split_part(u.email, '@', 1))::uuid
union
select p.id from public.players p
where p.email like 'results\_test\_player\_%@example.invalid' escape '\'
  and p.id = md5(split_part(p.email, '@', 1))::uuid;

create temp table rt_puzzles on commit drop as
select distinct puzzle_id from public.game_records
where player_id in (select id from rt_ids);

delete from public.game_records where player_id in (select id from rt_ids);
delete from public.player_stats where player_id in (select id from rt_ids);
delete from public.players      where id        in (select id from rt_ids);
delete from auth.users          where id        in (select id from rt_ids);

select public.rebuild_puzzle_stats_for(puzzle_id) from rt_puzzles;

commit;

select count(*) as synthetic_rows_remaining
from public.game_records
where player_id in (
  select md5('results_test_player_' || lpad(k::text, 2, '0'))::uuid from generate_series(1, 50) k
);
