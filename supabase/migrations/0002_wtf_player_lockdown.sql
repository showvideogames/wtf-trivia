-- ============================================================================
--  WTF Trivia: player-table lockdown (the pre-existing "L1" fix, now required)
-- ============================================================================
--  This is supabase/puzzle_id_cutover/L1_security_lockdown_NOT_YET_APPLIED.sql
--  (audit A0, 2026-09-28), unchanged in intent. It was optional while every
--  player row was a guest's. With shared accounts, players.email holds real
--  people's addresses, so the permissive duplicates have to go before Phase 2.
--
--  What it does: removes ONLY the old "anyone" policies that sit next to the
--  correct own-row policies on players, game_records and player_stats.
--  Postgres allows a request if ANY policy allows it, so today anyone can read
--  every player row (emails), and read/edit every play and streak row. The
--  own-row policies that stay already cover everything the app does: guests
--  and accounts alike have a real session and only touch their own rows.
--
--  Content (games) is NOT touched here; the games policies are migration 0003.
--  Zero rows change. Guarded: aborts if an own-row policy were missing.
-- ============================================================================

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
    raise exception '0002 aborted: own-row policies missing: %', missing;
  end if;
end $$;

-- Players: no more reading everyone's row (emails), no more creating rows for other ids.
drop policy if exists "Players can read own row"      on public.players;
drop policy if exists "Anyone can create a player"    on public.players;

-- Play records: only your own.
drop policy if exists "Players can read own records"   on public.game_records;
drop policy if exists "Players can insert own records" on public.game_records;
drop policy if exists "Players can update own records" on public.game_records;

-- Streak stats: only your own.
drop policy if exists "Players can read own stats"   on public.player_stats;
drop policy if exists "Players can insert own stats" on public.player_stats;
drop policy if exists "Players can update own stats" on public.player_stats;

-- Table privileges on the player tables, set explicitly rather than inherited
-- from the project default (which granted anon everything). The app never
-- deletes a play, a stats row or a player from the browser.
revoke all on table public.players, public.game_records, public.player_stats from anon;
revoke delete, truncate, references, trigger on table public.players, public.game_records, public.player_stats from authenticated;
grant select, insert, update on table public.players, public.game_records, public.player_stats to authenticated;

-- Community stats are read-only for clients; only the trigger (owner) writes them.
revoke all on table public.puzzle_stats from anon, authenticated;
grant select on table public.puzzle_stats to anon, authenticated;

-- Stats functions: only the database's own triggers run them (already so on the
-- hosted project; repeated here so a blank project matches).
revoke execute on function public.rebuild_puzzle_stats_for(text) from public, anon, authenticated;
revoke execute on function public.rebuild_puzzle_stats()         from public, anon, authenticated;
revoke execute on function public.handle_completed_game_record() from public, anon, authenticated;
revoke execute on function public.game_records_assign_puzzle()   from public, anon, authenticated;
