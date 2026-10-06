-- ============================================================================
--  What The Fudge Trivia: database baseline (shared accounts, Phase 1)
-- ============================================================================
--  The first CLI migration this project has had. It does two things:
--
--  A. Declares the LIVE schema exactly as the hosted project "Trivia Game" has
--     it (read-only inventory of 2026-10-06): the content table `games`, the
--     player tables (`players`, `game_records`, `player_stats`,
--     `puzzle_favorites`), the community tables (`puzzle_stats`,
--     `puzzle_favorite_counts`), their functions, triggers, policies and
--     grants. Every statement in section A is create-if-missing / replace with
--     the identical live body, so a blank local stack rebuilds from git and the
--     hosted project would see no-ops. Hosted Phase 2 does NOT run section A at
--     all (see supabase/ops/hosted/phase2-install.sql): the hosted content is
--     never recreated, renumbered or rewritten.
--
--  B. Adds the shared-account layer, modelled on Cluevoyance's
--     0001_cluevoyance_baseline.sql (game #2) and Rainbow's account layer
--     (game #1), adapted to WTF's one real difference: WTF guests are
--     ANONYMOUS SUPABASE AUTH USERS with server-side rows keyed by auth.uid()
--     (players.id). So:
--
--       accounts           one row per WTF account; global_user_id is the WorkOS
--                          user id (the cross-game link), NEVER a key for
--                          gameplay data. Written only by ensure_account().
--       wtf_uid()          THE ACCOUNT BOUNDARY: the caller's account id, or
--                          NULL for a guest (an anonymous user, or any auth
--                          user without an accounts row). Account-only RPCs use
--                          it. Gameplay tables keep auth.uid() = player_id,
--                          because guests legitimately own rows there.
--       guest_handoffs     the one-time code a guest mints before leaving for
--                          the shared sign-in, so the account that comes back
--                          can prove it owned that guest's rows. "Add my
--                          progress" moves the rows IN PLACE (same ids);
--                          "Start fresh" leaves them where they are.
--       admins             which accounts may write official content (the
--                          games policies that enforce it are the separate,
--                          opt-in migration 0003).
--
--  Rules kept from both earlier games:
--   * global_user_id is copied from auth.identities on the server, never from
--     a client value or user_metadata.
--   * An account's current email is read from its custom:platform identity
--     (account_email()); auth.users.email is only a fallback. Email is
--     metadata, never identity.
--   * New tables: REVOKE ALL from PUBLIC/anon/authenticated, then exactly the
--     intended DML. New functions: REVOKE, then GRANT by role.
--   * Outcomes are rows ("ok" / "not_platform_linked" / ...), not exceptions.
--   * Nothing here touches a row of `games`. Content is never a casualty of
--     account work: no FK from the account layer points at content with a
--     cascade, and deleting a player or an account can only ever remove that
--     player's own rows.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- A. THE LIVE SCHEMA (declared; no-ops where it already exists)
-- ============================================================================

-- ---- A1. Content: one row per puzzle; the questions live inside the row ----
create table if not exists public.games (
  id text primary key,
  date text not null,
  theme_title text not null,
  category_a text not null,
  category_b text not null,
  category_a_color text,
  category_b_color text,
  category_a_image text,
  category_b_image text,
  header_image text,
  status text not null default 'draft',
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  category_a_share_name text,
  category_b_share_name text,
  tags text[] not null default '{}'::text[],
  category_a_subtitle text,
  category_b_subtitle text,
  category_a_button_name text,
  category_b_button_name text,
  constraint games_status_check check (status in ('draft', 'published', 'retired')),
  constraint games_published_date_iso check (status <> 'published' or date ~ '^\d{4}-\d{2}-\d{2}$')
);

create unique index if not exists games_one_published_per_date
  on public.games (date) where status = 'published';

-- ---- A2. Players (guests sign in anonymously; players.id = auth.uid()) ----
create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  email text,
  is_guest boolean not null default true,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.game_records (
  id bigint generated by default as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  game_date text not null,
  theme_title text,
  score integer not null default 0,
  total_questions integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  started_at timestamptz default now(),
  completed_at timestamptz,
  puzzle_id text not null references public.games(id) on delete restrict,
  constraint game_records_player_puzzle_key unique (player_id, puzzle_id)
);

create index if not exists game_records_puzzle_completed_idx
  on public.game_records (puzzle_id) where completed;

create table if not exists public.player_stats (
  player_id uuid primary key references public.players(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_played_date text,
  total_played integer not null default 0,
  total_correct integer not null default 0,
  total_questions integer not null default 0,
  best_combo integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists public.puzzle_stats (
  puzzle_id text primary key references public.games(id) on delete cascade,
  total_finished integer not null default 0,
  total_score integer not null default 0,
  perfect_count integer not null default 0,
  total_questions integer not null default 0,
  question_correct_counts jsonb not null default '[]'::jsonb,
  question_answer_counts jsonb not null default '[]'::jsonb,
  score_histogram jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.puzzle_favorites (
  player_id uuid not null references public.players(id) on delete cascade,
  puzzle_id text not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, puzzle_id)
);

create index if not exists puzzle_favorites_puzzle_idx
  on public.puzzle_favorites (puzzle_id);

create table if not exists public.puzzle_favorite_counts (
  puzzle_id text primary key references public.games(id) on delete cascade,
  favorite_count integer not null default 0 check (favorite_count >= 0),
  updated_at timestamptz not null default now()
);

-- ---- A3. Functions, exactly the live bodies ----
create or replace function public.bump_jsonb_array_value(source jsonb, array_index integer, bump_by integer default 1)
returns jsonb language plpgsql as $$
declare
  working jsonb := coalesce(source, '[]'::jsonb);
  current_length integer := coalesce(jsonb_array_length(working), 0);
  current_value integer;
begin
  if array_index < 0 then
    return working;
  end if;
  while current_length <= array_index loop
    working := working || to_jsonb(0);
    current_length := current_length + 1;
  end loop;
  current_value := coalesce((working ->> array_index)::integer, 0);
  working := jsonb_set(working, array[array_index::text], to_jsonb(current_value + coalesce(bump_by, 0)));
  return working;
end;
$$;

create or replace function public.bump_jsonb_object_count(source jsonb, bucket text, bump_by integer default 1)
returns jsonb language sql as $$
  select jsonb_set(
    coalesce(source, '{}'::jsonb),
    array[bucket],
    to_jsonb(coalesce((coalesce(source, '{}'::jsonb) ->> bucket)::integer, 0) + coalesce(bump_by, 0)),
    true
  );
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.game_records_assign_puzzle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- A play never moves to another puzzle.
    new.puzzle_id := old.puzzle_id;
    return new;
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
  if target_puzzle_id is null then
    return;
  end if;

  -- One rebuild of a puzzle at a time (simultaneous-finisher fix).
  perform pg_advisory_xact_lock(hashtext('puzzle_stats:' || target_puzzle_id));

  delete from public.puzzle_stats where puzzle_id = target_puzzle_id;

  insert into public.puzzle_stats (
    puzzle_id,
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

create or replace function public.rebuild_puzzle_stats()
returns void language plpgsql security definer set search_path = public as $$
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

create or replace function public.handle_completed_game_record()
returns trigger language plpgsql security definer set search_path = public as $$
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

create or replace function public.puzzle_favorites_count()
returns trigger language plpgsql security definer set search_path = public as $$
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

create or replace function public.set_puzzle_favorite(target_puzzle_id text, favorite boolean)
returns integer language plpgsql set search_path = public as $$
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

-- ---- A4. Triggers, exactly as live ----
drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
before update on public.games for each row execute function public.set_updated_at();

drop trigger if exists player_stats_set_updated_at on public.player_stats;
create trigger player_stats_set_updated_at
before update on public.player_stats for each row execute function public.set_updated_at();

drop trigger if exists puzzle_stats_set_updated_at on public.puzzle_stats;
create trigger puzzle_stats_set_updated_at
before update on public.puzzle_stats for each row execute function public.set_updated_at();

drop trigger if exists game_records_assign_puzzle on public.game_records;
create trigger game_records_assign_puzzle
before insert or update on public.game_records for each row execute function public.game_records_assign_puzzle();

drop trigger if exists game_records_completed_stats on public.game_records;
create trigger game_records_completed_stats
after insert or update or delete on public.game_records for each row execute function public.handle_completed_game_record();

drop trigger if exists puzzle_favorites_count on public.puzzle_favorites;
create trigger puzzle_favorites_count
after insert or delete on public.puzzle_favorites for each row execute function public.puzzle_favorites_count();

-- ---- A5. RLS and the live policies (both the old permissive set and the own-row set,
--          exactly as the hosted project has them today; 0002 removes the permissive duplicates) ----
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.game_records enable row level security;
alter table public.player_stats enable row level security;
alter table public.puzzle_stats enable row level security;
alter table public.puzzle_favorites enable row level security;
alter table public.puzzle_favorite_counts enable row level security;

-- games (the beta-era open policies; the admin gate is migration 0003)
drop policy if exists "Anyone can delete games" on public.games;
create policy "Anyone can delete games" on public.games for delete using (true);
drop policy if exists "Anyone can insert games" on public.games;
create policy "Anyone can insert games" on public.games for insert with check (true);
drop policy if exists "Anyone can read all games for admin" on public.games;
create policy "Anyone can read all games for admin" on public.games for select using (true);
drop policy if exists "Anyone can read published games" on public.games;
create policy "Anyone can read published games" on public.games for select using (status = 'published');
drop policy if exists "Anyone can update games" on public.games;
create policy "Anyone can update games" on public.games for update using (true);
drop policy if exists "games are readable" on public.games;
create policy "games are readable" on public.games for select to anon, authenticated using (true);
drop policy if exists "games are writable" on public.games;
create policy "games are writable" on public.games for all to anon, authenticated using (true) with check (true);

-- players
drop policy if exists "Anyone can create a player" on public.players;
create policy "Anyone can create a player" on public.players for insert with check (true);
drop policy if exists "Players can read own row" on public.players;
create policy "Players can read own row" on public.players for select using (true);
drop policy if exists "players create profile" on public.players;
create policy "players create profile" on public.players for insert to authenticated with check (auth.uid() = id);
drop policy if exists "players own profile" on public.players;
create policy "players own profile" on public.players for select to authenticated using (auth.uid() = id);
drop policy if exists "players update profile" on public.players;
create policy "players update profile" on public.players for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- game_records
drop policy if exists "Players can insert own records" on public.game_records;
create policy "Players can insert own records" on public.game_records for insert with check (true);
drop policy if exists "Players can read own records" on public.game_records;
create policy "Players can read own records" on public.game_records for select using (true);
drop policy if exists "Players can update own records" on public.game_records;
create policy "Players can update own records" on public.game_records for update using (true);
drop policy if exists "game records insert own rows" on public.game_records;
create policy "game records insert own rows" on public.game_records for insert to authenticated with check (auth.uid() = player_id);
drop policy if exists "game records own rows" on public.game_records;
create policy "game records own rows" on public.game_records for select to authenticated using (auth.uid() = player_id);
drop policy if exists "game records update own rows" on public.game_records;
create policy "game records update own rows" on public.game_records for update to authenticated using (auth.uid() = player_id) with check (auth.uid() = player_id);

-- player_stats
drop policy if exists "Players can insert own stats" on public.player_stats;
create policy "Players can insert own stats" on public.player_stats for insert with check (true);
drop policy if exists "Players can read own stats" on public.player_stats;
create policy "Players can read own stats" on public.player_stats for select using (true);
drop policy if exists "Players can update own stats" on public.player_stats;
create policy "Players can update own stats" on public.player_stats for update using (true);
drop policy if exists "player stats insert own rows" on public.player_stats;
create policy "player stats insert own rows" on public.player_stats for insert to authenticated with check (auth.uid() = player_id);
drop policy if exists "player stats own rows" on public.player_stats;
create policy "player stats own rows" on public.player_stats for select to authenticated using (auth.uid() = player_id);
drop policy if exists "player stats update own rows" on public.player_stats;
create policy "player stats update own rows" on public.player_stats for update to authenticated using (auth.uid() = player_id) with check (auth.uid() = player_id);

-- community tables and favorites
drop policy if exists "puzzle stats are readable" on public.puzzle_stats;
create policy "puzzle stats are readable" on public.puzzle_stats for select to anon, authenticated using (true);
drop policy if exists "puzzle favorite counts are readable" on public.puzzle_favorite_counts;
create policy "puzzle favorite counts are readable" on public.puzzle_favorite_counts for select to anon, authenticated using (true);
drop policy if exists "puzzle favorites own rows" on public.puzzle_favorites;
create policy "puzzle favorites own rows" on public.puzzle_favorites for select to authenticated using (auth.uid() = player_id);
drop policy if exists "puzzle favorites insert own rows" on public.puzzle_favorites;
create policy "puzzle favorites insert own rows" on public.puzzle_favorites for insert to authenticated with check (auth.uid() = player_id);
drop policy if exists "puzzle favorites delete own rows" on public.puzzle_favorites;
create policy "puzzle favorites delete own rows" on public.puzzle_favorites for delete to authenticated using (auth.uid() = player_id);

-- ---- A6. Grants exactly as live (the project's default ACL gives anon and
--          authenticated every privilege on games and the player tables; favorites
--          were set explicitly by supabase/puzzle_favorites.sql) ----
grant all on table public.games, public.players, public.game_records, public.player_stats, public.puzzle_stats
  to anon, authenticated, service_role;
grant usage, select, update on sequence public.game_records_id_seq to anon, authenticated, service_role;
revoke all on table public.puzzle_favorites from anon, authenticated;
grant select, insert, delete on table public.puzzle_favorites to authenticated;
grant all on table public.puzzle_favorites to service_role;
revoke all on table public.puzzle_favorite_counts from anon, authenticated;
grant select on table public.puzzle_favorite_counts to anon, authenticated;
grant all on table public.puzzle_favorite_counts to service_role;

revoke execute on function public.game_records_assign_puzzle()   from public, anon, authenticated;
revoke execute on function public.rebuild_puzzle_stats_for(text) from public, anon, authenticated;
revoke execute on function public.rebuild_puzzle_stats()         from public, anon, authenticated;
revoke execute on function public.handle_completed_game_record() from public, anon, authenticated;
revoke execute on function public.puzzle_favorites_count()       from public, anon, authenticated;
revoke execute on function public.set_puzzle_favorite(text, boolean) from public, anon;
grant  execute on function public.set_puzzle_favorite(text, boolean) to authenticated, service_role;

-- ---- A7. The image bucket and its live policies (only where the storage schema exists;
--          the local test stack runs without the storage service) ----
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('wtf-images', 'wtf-images', true) on conflict (id) do nothing;
  end if;
  if to_regclass('storage.objects') is not null then
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Anyone can read images') then
      create policy "Anyone can read images" on storage.objects for select using (bucket_id = 'wtf-images');
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Anyone can upload images') then
      create policy "Anyone can upload images" on storage.objects for insert with check (bucket_id = 'wtf-images');
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Anyone can delete images') then
      create policy "Anyone can delete images" on storage.objects for delete using (bucket_id = 'wtf-images');
    end if;
  end if;
end $$;

-- ============================================================================
-- B. THE LOCAL ACCOUNT
-- ============================================================================
create table public.accounts (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  global_user_id  text not null,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  constraint accounts_global_user_id_key    unique (global_user_id),
  constraint accounts_global_user_id_format check (global_user_id ~ '^user_[0-9A-Za-z]{10,64}$')
);
comment on table  public.accounts is 'A WTF Trivia account. An auth user is an account only when it has a row here; the only writer is ensure_account(). The same uuid is the player id (players.id).';
comment on column public.accounts.global_user_id is 'The shared identity provider''s user id (user_...). The cross-game link; never a key for gameplay data.';

alter table public.accounts enable row level security;   -- no policies: reachable only through RPCs

-- The account boundary.
create function public.wtf_uid() returns uuid
language sql stable security definer set search_path = public as $$
  select a.user_id
    from public.accounts a
   where a.user_id = auth.uid()
$$;
comment on function public.wtf_uid() is 'The caller''s account id, or NULL when the caller is a guest (anonymous user) or any auth user that is not a WTF account. Account-only RPCs and policies use this.';

-- The ONE source of an account's current email: the provider identity, which
-- GoTrue refreshes on every sign-in; auth.users.email is only a fallback.
create function public.account_email(_user_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(btrim(i.identity_data ->> 'email'), '')
       from auth.identities i
      where i.user_id = _user_id
        and i.provider = 'custom:platform'
      order by i.created_at
      limit 1),
    (select u.email::text
       from auth.users u
      where u.id = _user_id)
  )
$$;

-- Create or refresh the account behind the current session. Also keeps the
-- player row in step: an account's player is not a guest and carries the
-- identity-first email (display only).
create function public.ensure_account()
returns table(outcome text, user_id uuid, global_user_id text, email text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  _uid uuid := auth.uid();
  _gid text;
begin
  if _uid is null then
    return query select 'not_signed_in'::text, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- The link is read from GoTrue's identity table, never from the client.
  select i.provider_id
    into _gid
    from auth.identities i
   where i.user_id = _uid
     and i.provider = 'custom:platform'
   order by i.created_at
   limit 1;

  if _gid is null then
    -- A guest (anonymous user) or an auth user that did not come through the
    -- shared sign-in (the old email/password beta users, dashboard users).
    -- Not, and never becomes, an account.
    return query select 'not_platform_linked'::text, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  insert into public.accounts (user_id, global_user_id)
  values (_uid, _gid)
  on conflict (user_id) do update
    set last_seen_at = now();

  insert into public.players (id, email, is_guest, last_seen_at)
  values (_uid, public.account_email(_uid), false, now())
  on conflict (id) do update
    set email = excluded.email, is_guest = false, last_seen_at = now();

  return query
    select 'ok'::text, a.user_id, a.global_user_id, public.account_email(a.user_id), a.created_at
      from public.accounts a
     where a.user_id = _uid;
end;
$$;

create function public.my_account()
returns table(user_id uuid, global_user_id text, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.user_id, a.global_user_id, public.account_email(a.user_id), a.created_at
    from public.accounts a
   where a.user_id = auth.uid()
$$;

create function public.ping() returns boolean
language sql stable set search_path = public as $$ select true $$;

-- ============================================================================
-- C. ADMINS (the gate itself is migration 0003, applied only when approved)
-- ============================================================================
create table public.admins (
  user_id     uuid primary key references public.accounts(user_id) on delete cascade,
  granted_at  timestamptz not null default now()
);
comment on table public.admins is 'Accounts allowed to write official content once 0003 is applied. Granted by the owner in SQL: insert into public.admins (user_id) select user_id from public.accounts where global_user_id = ''user_...'';';
alter table public.admins enable row level security;

create function public.is_wtf_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins ad where ad.user_id = public.wtf_uid())
$$;

-- ============================================================================
-- D. PLAYER STATS, RECOMPUTED FROM PLAYS
--    The app maintains player_stats incrementally on every finish. When two
--    players' plays become one person's (an import), the counters are rebuilt
--    from the merged plays instead of being summed: Games = finished plays,
--    Accuracy = correct / asked, Best Combo = the longest run of correct answers
--    in any play, Streak = consecutive puzzle dates ending at the last play.
-- ============================================================================
create function public.best_combo(_answers jsonb) returns integer
language plpgsql immutable as $$
declare
  _best integer := 0;
  _cur integer := 0;
  _el jsonb;
begin
  if _answers is null or jsonb_typeof(_answers) <> 'array' then
    return 0;
  end if;
  for _el in select * from jsonb_array_elements(_answers) loop
    if coalesce((_el ->> 'correct')::boolean, false) then
      _cur := _cur + 1;
      if _cur > _best then _best := _cur; end if;
    else
      _cur := 0;
    end if;
  end loop;
  return _best;
end;
$$;

create function public.recompute_player_stats(_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  _played integer;
  _correct integer;
  _asked integer;
  _combo integer;
  _last text;
  _dates date[];
  _longest integer := 0;
  _current integer := 0;
  _run integer := 0;
  _i integer;
begin
  select count(*)::int, coalesce(sum(score), 0)::int, coalesce(sum(total_questions), 0)::int,
         coalesce(max(public.best_combo(answers)), 0)::int, max(game_date)
    into _played, _correct, _asked, _combo, _last
    from public.game_records
   where player_id = _player_id and completed;

  if _played = 0 then
    delete from public.player_stats where player_id = _player_id;
    return;
  end if;

  -- distinct, well-formed play dates in order (game_date is text on the live project)
  select array_agg(d order by d) into _dates
    from (select distinct (game_date)::date as d
            from public.game_records
           where player_id = _player_id and completed and game_date ~ '^\d{4}-\d{2}-\d{2}$') s;

  if _dates is not null then
    for _i in 1 .. array_length(_dates, 1) loop
      if _i > 1 and _dates[_i] = _dates[_i - 1] + 1 then
        _run := _run + 1;
      else
        _run := 1;
      end if;
      if _run > _longest then _longest := _run; end if;
    end loop;
    _current := _run;   -- the run that ends at the most recent play date
  end if;

  insert into public.player_stats as s (player_id, current_streak, longest_streak, last_played_date,
                                        total_played, total_correct, total_questions, best_combo, updated_at)
  values (_player_id, _current, _longest, _last, _played, _correct, _asked, _combo, now())
  on conflict (player_id) do update
    set current_streak = excluded.current_streak,
        longest_streak = excluded.longest_streak,
        last_played_date = excluded.last_played_date,
        total_played = excluded.total_played,
        total_correct = excluded.total_correct,
        total_questions = excluded.total_questions,
        best_combo = excluded.best_combo,
        updated_at = now();
end;
$$;

-- ============================================================================
-- E. GUEST HANDOFF: "Add my progress" / "Start fresh"
--    A guest is an anonymous auth user with rows of its own. Leaving for the
--    shared sign-in replaces that session with the account's, so before it
--    leaves the guest mints a one-time code (offer_guest_history). Only the
--    hash is stored; the code travels in the browser's sessionStorage and is
--    presented by the account afterwards. Expired, unknown or used codes say
--    nothing and move nothing. One decision per guest, ever.
-- ============================================================================
create table public.guest_handoffs (
  code_hash        text primary key,
  guest_player_id  uuid not null references public.players(id) on delete cascade,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '1 hour'
);
comment on table public.guest_handoffs is 'One-time, hashed codes a guest mints before the shared sign-in so the returning account can claim (or decline) that guest''s rows. Rows go when the guest player goes.';
alter table public.guest_handoffs enable row level security;   -- no policies: RPC only

create function public.guest_history_summary(_player_id uuid)
returns table(plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from public.game_records r where r.player_id = _player_id),
         (select count(*)::int from public.game_records r where r.player_id = _player_id and r.completed),
         coalesce((select s.current_streak from public.player_stats s where s.player_id = _player_id), 0),
         coalesce((select s.longest_streak from public.player_stats s where s.player_id = _player_id), 0),
         (select count(*)::int from public.puzzle_favorites f where f.player_id = _player_id)
$$;

-- Called by the GUEST (anonymous session) right before it leaves for sign-in.
create function public.offer_guest_history()
returns table(outcome text, code text, plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  _uid uuid := auth.uid();
  _code text;
  _s record;
begin
  if _uid is null then
    return query select 'not_signed_in'::text, null::text, 0, 0, 0, 0, 0;
    return;
  end if;
  -- Only an anonymous guest that is not an account can hand anything over.
  if exists (select 1 from public.accounts a where a.user_id = _uid)
     or not exists (select 1 from auth.users u where u.id = _uid and u.is_anonymous) then
    return query select 'not_a_guest'::text, null::text, 0, 0, 0, 0, 0;
    return;
  end if;

  select * into _s from public.guest_history_summary(_uid);
  if _s.plays = 0 and _s.favorites = 0 then
    return query select 'no_history'::text, null::text, 0, 0, 0, 0, 0;
    return;
  end if;

  -- 192 random bits, URL-safe; only its hash is kept.
  _code := translate(rtrim(encode(gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  delete from public.guest_handoffs where guest_player_id = _uid;
  insert into public.guest_handoffs (code_hash, guest_player_id)
  values (encode(digest(_code, 'sha256'), 'hex'), _uid);

  return query select 'ok'::text, _code, _s.plays, _s.finished, _s.current_streak, _s.longest_streak, _s.favorites;
end;
$$;

-- Called by the ACCOUNT after sign-in: is this code still good, and what would come across?
create function public.resolve_guest_handoff(_code text)
returns table(outcome text, plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer, account_has_history boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  _uid uuid := public.wtf_uid();
  _h public.guest_handoffs;
  _s record;
begin
  if _uid is null then
    return query select 'not_signed_in'::text, 0, 0, 0, 0, 0, false;
    return;
  end if;
  if _code is null or length(_code) < 16 or length(_code) > 128 then
    return query select 'invalid'::text, 0, 0, 0, 0, 0, false;
    return;
  end if;
  select * into _h from public.guest_handoffs h where h.code_hash = encode(digest(_code, 'sha256'), 'hex');
  if not found then
    return query select 'invalid'::text, 0, 0, 0, 0, 0, false;
    return;
  end if;
  if _h.expires_at < now() then
    return query select 'expired'::text, 0, 0, 0, 0, 0, false;
    return;
  end if;
  select * into _s from public.guest_history_summary(_h.guest_player_id);
  return query select 'ok'::text, _s.plays, _s.finished, _s.current_streak, _s.longest_streak, _s.favorites,
    exists (select 1 from public.game_records r where r.player_id = _uid)
    or exists (select 1 from public.puzzle_favorites f where f.player_id = _uid);
end;
$$;

-- "Add my progress": the guest's rows change owner IN PLACE (same ids, nothing
-- created). Where both the guest and the account played the same puzzle the
-- better play is kept (finished beats unfinished, then the higher score, then
-- the account's); the other is removed and that puzzle's community stats are
-- rebuilt so one person is counted once. Favorites are united. The account's
-- counters are recomputed from the merged plays. The guest's anonymous auth
-- user is then deleted: it has nothing left and its session is gone.
create function public.import_guest_history(_code text)
returns table(outcome text, plays_moved integer, plays_dropped integer, favorites_moved integer)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  _uid uuid := public.wtf_uid();
  _h public.guest_handoffs;
  _guest uuid;
  _conflicts text[];
  _moved integer := 0;
  _dropped integer := 0;
  _favs integer := 0;
  _pid text;
begin
  if _uid is null then
    return query select 'not_signed_in'::text, 0, 0, 0;
    return;
  end if;
  if _code is null or length(_code) < 16 or length(_code) > 128 then
    return query select 'invalid'::text, 0, 0, 0;
    return;
  end if;
  select * into _h from public.guest_handoffs h where h.code_hash = encode(digest(_code, 'sha256'), 'hex') for update;
  if not found then
    return query select 'invalid'::text, 0, 0, 0;
    return;
  end if;
  if _h.expires_at < now() then
    delete from public.guest_handoffs where code_hash = _h.code_hash;
    return query select 'expired'::text, 0, 0, 0;
    return;
  end if;
  _guest := _h.guest_player_id;
  if _guest = _uid or exists (select 1 from public.accounts a where a.user_id = _guest) then
    delete from public.guest_handoffs where code_hash = _h.code_hash;
    return query select 'invalid'::text, 0, 0, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wtf_handoff:' || _guest::text, 0));
  -- The code is single-use whatever happens below.
  delete from public.guest_handoffs where guest_player_id = _guest;

  -- Community stats: rebuilt once per affected puzzle at the end, not per row.
  perform set_config('wtf.defer_stats', 'on', true);

  select array_agg(distinct g.puzzle_id) into _conflicts
    from public.game_records g
    join public.game_records a on a.puzzle_id = g.puzzle_id and a.player_id = _uid
   where g.player_id = _guest;

  -- Keep the better play per conflicting puzzle; drop the other.
  with both_sides as (
    select g.puzzle_id, g.id as guest_id, a.id as account_id,
           (g.completed and not a.completed) or (g.completed = a.completed and g.score > a.score) as guest_wins
      from public.game_records g
      join public.game_records a on a.puzzle_id = g.puzzle_id and a.player_id = _uid
     where g.player_id = _guest
  )
  delete from public.game_records r
   using both_sides b
   where r.id = case when b.guest_wins then b.account_id else b.guest_id end;
  get diagnostics _dropped = row_count;

  update public.game_records set player_id = _uid where player_id = _guest;
  get diagnostics _moved = row_count;

  -- Favorites: a puzzle both favorited counts once (the trigger decrements).
  delete from public.puzzle_favorites f
   where f.player_id = _guest
     and exists (select 1 from public.puzzle_favorites a where a.player_id = _uid and a.puzzle_id = f.puzzle_id);
  update public.puzzle_favorites set player_id = _uid where player_id = _guest;
  get diagnostics _favs = row_count;

  perform public.recompute_player_stats(_uid);

  if _conflicts is not null then
    foreach _pid in array _conflicts loop
      perform public.rebuild_puzzle_stats_for(_pid);
    end loop;
  end if;

  -- The guest has nothing left. GoTrue's cascades remove its sessions and
  -- refresh tokens; players cascades from auth.users; player_stats from players.
  delete from public.player_stats where player_id = _guest;
  delete from public.players where id = _guest;
  delete from auth.users where id = _guest;

  return query select 'imported'::text, _moved, _dropped, _favs;
end;
$$;

-- "Start fresh": the guest rows stay exactly where they are, still counted in
-- community stats, unreachable from this browser (its guest session is gone).
create function public.decline_guest_history(_code text)
returns table(outcome text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  _uid uuid := public.wtf_uid();
  _rows integer;
begin
  if _uid is null then
    return query select 'not_signed_in'::text;
    return;
  end if;
  if _code is null or length(_code) < 16 or length(_code) > 128 then
    return query select 'invalid'::text;
    return;
  end if;
  delete from public.guest_handoffs where code_hash = encode(digest(_code, 'sha256'), 'hex');
  get diagnostics _rows = row_count;
  if _rows = 0 then
    return query select 'invalid'::text;
    return;
  end if;
  return query select 'started_fresh'::text;
end;
$$;

-- ============================================================================
-- F. DELETION
-- ============================================================================
create function public.delete_local_account(_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  _puzzles text[];
  _pid text;
begin
  if _user_id is null then
    return;
  end if;
  perform set_config('wtf.defer_stats', 'on', true);
  select array_agg(distinct puzzle_id) into _puzzles
    from public.game_records where player_id = _user_id and completed;

  -- Personal rows only. Every FK here points from the player's rows to content
  -- with ON DELETE RESTRICT/CASCADE in the content→player direction never the
  -- reverse, so nothing in `games` can be reached.
  delete from public.puzzle_favorites where player_id = _user_id;   -- counts trigger decrements
  delete from public.game_records     where player_id = _user_id;
  delete from public.player_stats     where player_id = _user_id;
  delete from public.guest_handoffs   where guest_player_id = _user_id;
  delete from public.admins           where user_id = _user_id;
  delete from public.accounts         where user_id = _user_id;
  delete from public.players          where id = _user_id;
  -- GoTrue's own cascades remove identities, sessions and refresh tokens.
  delete from auth.users where id = _user_id;

  if _puzzles is not null then
    foreach _pid in array _puzzles loop
      perform public.rebuild_puzzle_stats_for(_pid);
    end loop;
  end if;
end;
$$;

create function public.delete_my_account() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := public.wtf_uid();
begin
  if _uid is null then
    return false;
  end if;
  perform public.delete_local_account(_uid);
  return true;
end;
$$;

-- ============================================================================
-- G. GRANTS for everything this migration added: revoke, then grant by intent.
-- ============================================================================
revoke all on table public.accounts, public.admins, public.guest_handoffs from public, anon, authenticated;
grant all on table public.accounts, public.admins, public.guest_handoffs to service_role;

revoke all on function public.wtf_uid()                        from public, anon, authenticated;
revoke all on function public.account_email(uuid)              from public, anon, authenticated;
revoke all on function public.ensure_account()                 from public, anon, authenticated;
revoke all on function public.my_account()                     from public, anon, authenticated;
revoke all on function public.ping()                           from public, anon, authenticated;
revoke all on function public.is_wtf_admin()                   from public, anon, authenticated;
revoke all on function public.best_combo(jsonb)                from public, anon, authenticated;
revoke all on function public.recompute_player_stats(uuid)     from public, anon, authenticated;
revoke all on function public.guest_history_summary(uuid)      from public, anon, authenticated;
revoke all on function public.offer_guest_history()            from public, anon, authenticated;
revoke all on function public.resolve_guest_handoff(text)      from public, anon, authenticated;
revoke all on function public.import_guest_history(text)       from public, anon, authenticated;
revoke all on function public.decline_guest_history(text)      from public, anon, authenticated;
revoke all on function public.delete_local_account(uuid)       from public, anon, authenticated;
revoke all on function public.delete_my_account()              from public, anon, authenticated;

grant execute on function public.wtf_uid()                     to anon, authenticated, service_role;
grant execute on function public.ping()                        to anon, authenticated, service_role;
grant execute on function public.is_wtf_admin()                to anon, authenticated, service_role;
grant execute on function public.ensure_account()              to authenticated, service_role;
grant execute on function public.my_account()                  to authenticated, service_role;
grant execute on function public.offer_guest_history()         to authenticated, service_role;   -- guests are `authenticated` too
grant execute on function public.resolve_guest_handoff(text)   to authenticated, service_role;
grant execute on function public.import_guest_history(text)    to authenticated, service_role;
grant execute on function public.decline_guest_history(text)   to authenticated, service_role;
grant execute on function public.delete_my_account()           to authenticated, service_role;
grant execute on function public.account_email(uuid)           to service_role;
grant execute on function public.best_combo(jsonb)             to service_role;
grant execute on function public.recompute_player_stats(uuid)  to service_role;
grant execute on function public.guest_history_summary(uuid)   to service_role;
grant execute on function public.delete_local_account(uuid)    to service_role;
