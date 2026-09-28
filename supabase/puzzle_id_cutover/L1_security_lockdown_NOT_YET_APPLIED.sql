-- ============================================================
-- L1  MINIMAL SECURITY LOCKDOWN     *** NOT YET APPLIED ***
--                                   *** DO NOT RUN WITHOUT OWNER APPROVAL ***
--
-- THE PROBLEM (found by audit A0, 2026-09-28): older, permissive policies
-- sit next to the correct ones, and Postgres allows a request if ANY policy
-- allows it. So today anyone on the internet, signed in or not, can:
--   * read every player row, including EMAIL ADDRESSES   (players)
--   * read, create and EDIT every play record            (game_records)
--   * read, create and EDIT every player's streak stats  (player_stats)
--   * call the stats rebuild functions directly (one of them empties and
--     recomputes all community stats)
--
-- THE FIX: remove only the permissive duplicates. The correct policies that
-- stay already cover everything the app does: every player, guests
-- included, has a real session (guests sign in anonymously), and the app
-- only ever reads or writes that player's own rows.
--
-- Independent of the puzzle-id cutover: safe before or after C1/C2.
-- NOT covered here (next security step, needs an Admin sign-in first):
-- anyone can still insert, edit and delete puzzles (games), and can read
-- drafts and future puzzles.
--
-- Undo: R_rollback_NOT_YET_APPLIED.sql, section RL1.
-- ============================================================

begin;

-- 0. Guard: the correct own-row policies must exist before the permissive
--    ones go, or players would be locked out of their own data.
do $$
declare missing text;
begin
  select string_agg(t || ': ' || p, ', ') into missing
  from (values
    ('players', 'players own profile'), ('players', 'players create profile'), ('players', 'players update profile'),
    ('game_records', 'game records own rows'), ('game_records', 'game records insert own rows'),
    ('game_records', 'game records update own rows'),
    ('player_stats', 'player stats own rows'), ('player_stats', 'player stats insert own rows'),
    ('player_stats', 'player stats update own rows')
  ) v(t, p)
  where not exists (select 1 from pg_policies where schemaname = 'public' and tablename = v.t and policyname = v.p);
  if missing is not null then
    raise exception 'L1 aborted: own-row policies missing: %', missing;
  end if;
end $$;

-- 1. Players: no more reading everyone's row (emails).
drop policy if exists "Players can read own row"      on public.players;
drop policy if exists "Anyone can create a player"    on public.players;

-- 2. Play records: only your own.
drop policy if exists "Players can read own records"   on public.game_records;
drop policy if exists "Players can insert own records" on public.game_records;
drop policy if exists "Players can update own records" on public.game_records;

-- 3. Streak stats: only your own.
drop policy if exists "Players can read own stats"   on public.player_stats;
drop policy if exists "Players can insert own stats" on public.player_stats;
drop policy if exists "Players can update own stats" on public.player_stats;

-- 4. Stats functions: only the database's own triggers run them. (Triggers
--    do not need this grant.) Covers both the current and the C1 names.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('rebuild_single_puzzle_stats', 'rebuild_puzzle_stats', 'rebuild_puzzle_stats_for',
                        'handle_completed_game_record', 'apply_completed_game_to_puzzle_stats',
                        'game_records_assign_puzzle', 'games_sync_puzzle_stats_date')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

commit;

-- 5. Report (read-only): the policies left on these tables.
select tablename, policyname, cmd, array_to_string(roles, ',') as roles,
       coalesce(qual, '-') as using_expr, coalesce(with_check, '-') as check_expr
from pg_policies
where schemaname = 'public' and tablename in ('players', 'game_records', 'player_stats', 'puzzle_stats')
order by tablename, policyname;
