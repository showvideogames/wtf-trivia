create extension if not exists pgcrypto;

create table if not exists public.games (
  id text primary key,
  date date not null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_guest boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.game_records (
  player_id uuid not null references public.players(id) on delete cascade,
  game_date date not null,
  theme_title text not null,
  score integer not null default 0,
  total_questions integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (player_id, game_date)
);

create table if not exists public.player_stats (
  player_id uuid primary key references public.players(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_played_date date,
  total_played integer not null default 0,
  total_correct integer not null default 0,
  total_questions integer not null default 0,
  best_combo integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.puzzle_stats (
  game_date date primary key,
  total_finished integer not null default 0,
  total_score integer not null default 0,
  perfect_count integer not null default 0,
  total_questions integer not null default 0,
  question_correct_counts jsonb not null default '[]'::jsonb,
  question_answer_counts jsonb not null default '[]'::jsonb,
  score_histogram jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.players
  add column if not exists email text,
  add column if not exists is_guest boolean not null default true,
  add column if not exists last_seen_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_id_fkey'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bump_jsonb_array_value(source jsonb, array_index integer, bump_by integer default 1)
returns jsonb
language plpgsql
as $$
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
returns jsonb
language sql
as $$
  select jsonb_set(
    coalesce(source, '{}'::jsonb),
    array[bucket],
    to_jsonb(coalesce((coalesce(source, '{}'::jsonb) ->> bucket)::integer, 0) + coalesce(bump_by, 0)),
    true
  );
$$;

create or replace function public.rebuild_single_puzzle_stats(target_game_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.puzzle_stats
  where game_date = target_game_date;

  insert into public.puzzle_stats (
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
      and game_date::date = target_game_date
  ),
  base as (
    select
      target_game_date::date as game_date,
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
    b.game_date,
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
    end as question_correct_counts,
    case
      when b.total_questions > 0 then (
        select jsonb_agg(q.answered_count order by q.idx)
        from question_rollup q
      )
      else '[]'::jsonb
    end as question_answer_counts,
    coalesce(
      (select jsonb_object_agg(s.bucket, s.count_value) from score_rollup s),
      '{}'::jsonb
    ) as score_histogram,
    now()
  from base b
  where b.total_finished > 0;
end;
$$;

create or replace function public.handle_completed_game_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed and (
    tg_op = 'insert'
    or not coalesce(old.completed, false)
    or old.score is distinct from new.score
    or old.answers is distinct from new.answers
    or old.total_questions is distinct from new.total_questions
  ) then
    perform public.rebuild_single_puzzle_stats(new.game_date::date);
  end if;
  return new;
end;
$$;

create or replace function public.rebuild_puzzle_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
begin
  truncate table public.puzzle_stats;

  for d in
    select distinct game_date
    from public.game_records
    where completed = true
    order by game_date
  loop
    perform public.rebuild_single_puzzle_stats(d::date);
  end loop;
end;
$$;

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
before update on public.games
for each row
execute function public.set_updated_at();

drop trigger if exists player_stats_set_updated_at on public.player_stats;
create trigger player_stats_set_updated_at
before update on public.player_stats
for each row
execute function public.set_updated_at();

drop trigger if exists puzzle_stats_set_updated_at on public.puzzle_stats;
create trigger puzzle_stats_set_updated_at
before update on public.puzzle_stats
for each row
execute function public.set_updated_at();

drop trigger if exists game_records_completed_stats on public.game_records;
create trigger game_records_completed_stats
after insert or update on public.game_records
for each row
execute function public.handle_completed_game_record();

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.game_records enable row level security;
alter table public.player_stats enable row level security;
alter table public.puzzle_stats enable row level security;

drop policy if exists "games are readable" on public.games;
create policy "games are readable"
on public.games
for select
to anon, authenticated
using (true);

drop policy if exists "games are writable" on public.games;
create policy "games are writable"
on public.games
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "players own profile" on public.players;
create policy "players own profile"
on public.players
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "players create profile" on public.players;
create policy "players create profile"
on public.players
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "players update profile" on public.players;
create policy "players update profile"
on public.players
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "game records own rows" on public.game_records;
create policy "game records own rows"
on public.game_records
for select
to authenticated
using (auth.uid() = player_id);

drop policy if exists "game records insert own rows" on public.game_records;
create policy "game records insert own rows"
on public.game_records
for insert
to authenticated
with check (auth.uid() = player_id);

drop policy if exists "game records update own rows" on public.game_records;
create policy "game records update own rows"
on public.game_records
for update
to authenticated
using (auth.uid() = player_id)
with check (auth.uid() = player_id);

drop policy if exists "player stats own rows" on public.player_stats;
create policy "player stats own rows"
on public.player_stats
for select
to authenticated
using (auth.uid() = player_id);

drop policy if exists "player stats insert own rows" on public.player_stats;
create policy "player stats insert own rows"
on public.player_stats
for insert
to authenticated
with check (auth.uid() = player_id);

drop policy if exists "player stats update own rows" on public.player_stats;
create policy "player stats update own rows"
on public.player_stats
for update
to authenticated
using (auth.uid() = player_id)
with check (auth.uid() = player_id);

drop policy if exists "puzzle stats are readable" on public.puzzle_stats;
create policy "puzzle stats are readable"
on public.puzzle_stats
for select
to anon, authenticated
using (true);

select public.rebuild_puzzle_stats();

insert into storage.buckets (id, name, public)
values ('wtf-images', 'wtf-images', true)
on conflict (id) do nothing;
