-- ============================================================
-- Puzzle favorites (Archive heart, Favorites filter, Most liked sort).
--
-- Adds, and changes nothing that exists:
--   * public.puzzle_favorites: one row per (player, puzzle) a player has
--     favorited. The primary key makes a second favorite of the same puzzle
--     impossible. Rows go when the player or the puzzle is deleted.
--   * public.puzzle_favorite_counts: one row per puzzle with its number of
--     favorites, so the Archive reads every count in one small request
--     without seeing anyone's favorites. Kept exact by a trigger on
--     puzzle_favorites (an atomic +1/-1 on the puzzle's row, so simultaneous
--     favorites and unfavorites from different players can't lose a count).
--   * public.set_puzzle_favorite(puzzle_id, favorite): adds or removes the
--     signed-in player's favorite and returns the puzzle's new count.
--
-- Players are the existing auth users (guests sign in anonymously), so the
-- player id is auth.uid(), exactly as for plays. Each player sees and changes
-- only their own favorites; counts are public, like puzzle_stats.
--
-- Safe to run more than once: every statement is create-if-missing or
-- replace, and the final step recounts every puzzle from the favorites
-- themselves (so a re-run also repairs any count). If a table of the same
-- name exists with a different shape, it stops with an error and changes
-- nothing.
-- ============================================================

begin;

create table if not exists public.puzzle_favorites (
  player_id uuid not null references public.players(id) on delete cascade,
  puzzle_id text not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, puzzle_id)
);

create table if not exists public.puzzle_favorite_counts (
  puzzle_id text primary key references public.games(id) on delete cascade,
  favorite_count integer not null default 0 check (favorite_count >= 0),
  updated_at timestamptz not null default now()
);

-- Refuse to carry on over a same-named table with another shape.
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'puzzle_favorites'
         and column_name in ('player_id', 'puzzle_id')) <> 2
     or (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'puzzle_favorite_counts'
         and column_name in ('puzzle_id', 'favorite_count')) <> 2
     or not exists (select 1 from pg_constraint
       where conrelid = 'public.puzzle_favorites'::regclass and contype = 'p'
         and array_length(conkey, 1) = 2)
  then
    raise exception 'puzzle_favorites or puzzle_favorite_counts already exists with an unexpected shape; nothing was changed';
  end if;
end;
$$;

-- "Which puzzles are this player's favorites" uses the primary key; this
-- serves the per-puzzle cascade and recount.
create index if not exists puzzle_favorites_puzzle_idx
  on public.puzzle_favorites (puzzle_id);

-- Keeps puzzle_favorite_counts exact. Runs as the table owner because
-- players can't write counts themselves.
create or replace function public.puzzle_favorites_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.puzzle_favorite_counts as c (puzzle_id, favorite_count, updated_at)
    values (new.puzzle_id, 1, now())
    on conflict (puzzle_id) do update
      set favorite_count = c.favorite_count + 1, updated_at = now();
    return null;
  end if;
  -- DELETE. A plain update: when the puzzle itself is being deleted its
  -- counts row may already be gone, and that's fine.
  update public.puzzle_favorite_counts
     set favorite_count = greatest(favorite_count - 1, 0), updated_at = now()
   where puzzle_id = old.puzzle_id;
  return null;
end;
$$;

revoke execute on function public.puzzle_favorites_count() from public, anon, authenticated;

drop trigger if exists puzzle_favorites_count on public.puzzle_favorites;
create trigger puzzle_favorites_count
after insert or delete on public.puzzle_favorites
for each row
execute function public.puzzle_favorites_count();

-- The Archive's heart. Runs as the caller, so the policies below apply:
-- a player can only add or remove their own favorite. Adding twice or
-- removing something that isn't there changes nothing. Returns the puzzle's
-- count after the change.
create or replace function public.set_puzzle_favorite(target_puzzle_id text, favorite boolean)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  me uuid := auth.uid();
  total integer;
begin
  if me is null then
    raise exception 'Sign in (or play as a guest) to favorite puzzles.' using errcode = '42501';
  end if;
  if favorite then
    insert into public.puzzle_favorites (player_id, puzzle_id)
    values (me, target_puzzle_id)
    on conflict (player_id, puzzle_id) do nothing;
  else
    delete from public.puzzle_favorites
     where player_id = me and puzzle_id = target_puzzle_id;
  end if;
  select c.favorite_count into total
    from public.puzzle_favorite_counts c
   where c.puzzle_id = target_puzzle_id;
  return coalesce(total, 0);
end;
$$;

revoke execute on function public.set_puzzle_favorite(text, boolean) from public, anon;
grant execute on function public.set_puzzle_favorite(text, boolean) to authenticated;

-- Table privileges, set explicitly rather than left to project defaults.
-- RLS (below) then limits favorites to the player's own rows.
--   puzzle_favorites: signed-in players may read, add and remove (their
--     own) favorites; never update or truncate. Signed-out: nothing.
--   puzzle_favorite_counts: read-only for everyone; only the trigger above
--     (running as the owner) writes it.
revoke all on table public.puzzle_favorites from anon, authenticated;
grant select, insert, delete on table public.puzzle_favorites to authenticated;

revoke all on table public.puzzle_favorite_counts from anon, authenticated;
grant select on table public.puzzle_favorite_counts to anon, authenticated;

alter table public.puzzle_favorites enable row level security;
alter table public.puzzle_favorite_counts enable row level security;

drop policy if exists "puzzle favorites own rows" on public.puzzle_favorites;
create policy "puzzle favorites own rows"
on public.puzzle_favorites
for select
to authenticated
using (auth.uid() = player_id);

drop policy if exists "puzzle favorites insert own rows" on public.puzzle_favorites;
create policy "puzzle favorites insert own rows"
on public.puzzle_favorites
for insert
to authenticated
with check (auth.uid() = player_id);

drop policy if exists "puzzle favorites delete own rows" on public.puzzle_favorites;
create policy "puzzle favorites delete own rows"
on public.puzzle_favorites
for delete
to authenticated
using (auth.uid() = player_id);

-- Counts hold no personal data. Nobody writes them directly: only the
-- trigger above does.
drop policy if exists "puzzle favorite counts are readable" on public.puzzle_favorite_counts;
create policy "puzzle favorite counts are readable"
on public.puzzle_favorite_counts
for select
to anon, authenticated
using (true);

-- Recount every puzzle from the favorites themselves. Blocks favorite
-- changes for the moment it takes, so nothing slips between count and save.
lock table public.puzzle_favorites in share row exclusive mode;

insert into public.puzzle_favorite_counts as c (puzzle_id, favorite_count, updated_at)
select f.puzzle_id, count(*)::int, now()
  from public.puzzle_favorites f
 group by f.puzzle_id
on conflict (puzzle_id) do update
  set favorite_count = excluded.favorite_count, updated_at = now()
  where c.favorite_count is distinct from excluded.favorite_count;

update public.puzzle_favorite_counts c
   set favorite_count = 0, updated_at = now()
 where c.favorite_count <> 0
   and not exists (select 1 from public.puzzle_favorites f where f.puzzle_id = c.puzzle_id);

commit;
