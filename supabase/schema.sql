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

create or replace function public.apply_completed_game_to_puzzle_stats(target_record public.game_records)
returns void
language plpgsql
as $$
declare
  answer jsonb;
  answer_index integer := 0;
  working_correct jsonb := '[]'::jsonb;
  working_answered jsonb := '[]'::jsonb;
  working_histogram jsonb := '{}'::jsonb;
begin
  insert into public.puzzle_stats (
    game_date,
    total_finished,
    total_score,
    perfect_count,
    total_questions,
    question_correct_counts,
    question_answer_counts,
    score_histogram
  )
  values (
    target_record.game_date,
    0,
    0,
    0,
    target_record.total_questions,
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb
  )
  on conflict (game_date) do nothing;

  select question_correct_counts, question_answer_counts, score_histogram
  into working_correct, working_answered, working_histogram
  from public.puzzle_stats
  where game_date = target_record.game_date;

  if jsonb_typeof(target_record.answers) = 'array' then
    for answer in select value from jsonb_array_elements(target_record.answers)
    loop
      working_answered := public.bump_jsonb_array_value(working_answered, answer_index, 1);
      if coalesce((answer ->> 'correct')::boolean, false) then
        working_correct := public.bump_jsonb_array_value(working_correct, answer_index, 1);
      end if;
      answer_index := answer_index + 1;
    end loop;
  end if;

  working_histogram := public.bump_jsonb_object_count(working_histogram, target_record.score::text, 1);

  update public.puzzle_stats
  set total_finished = total_finished + 1,
      total_score = total_score + target_record.score,
      perfect_count = perfect_count + case when target_record.total_questions > 0 and target_record.score = target_record.total_questions then 1 else 0 end,
      total_questions = greatest(total_questions, target_record.total_questions),
      question_correct_counts = working_correct,
      question_answer_counts = working_answered,
      score_histogram = working_histogram,
      updated_at = now()
  where game_date = target_record.game_date;
end;
$$;

create or replace function public.handle_completed_game_record()
returns trigger
language plpgsql
as $$
begin
  if new.completed and (tg_op = 'INSERT' or not coalesce(old.completed, false)) then
    perform public.apply_completed_game_to_puzzle_stats(new);
  end if;
  return new;
end;
$$;

create or replace function public.rebuild_puzzle_stats()
returns void
language plpgsql
as $$
declare
  record_row public.game_records%rowtype;
begin
  truncate table public.puzzle_stats;

  for record_row in
    select *
    from public.game_records
    where completed = true
    order by game_date, completed_at nulls last, started_at
  loop
    perform public.apply_completed_game_to_puzzle_stats(record_row);
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
