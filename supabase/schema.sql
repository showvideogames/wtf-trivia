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
  id uuid primary key,
  created_at timestamptz not null default now()
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
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

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.game_records enable row level security;
alter table public.player_stats enable row level security;

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

drop policy if exists "players are readable" on public.players;
create policy "players are readable"
on public.players
for select
to anon, authenticated
using (true);

drop policy if exists "players are insertable" on public.players;
create policy "players are insertable"
on public.players
for insert
to anon, authenticated
with check (true);

drop policy if exists "game records are readable" on public.game_records;
create policy "game records are readable"
on public.game_records
for select
to anon, authenticated
using (true);

drop policy if exists "game records are writable" on public.game_records;
create policy "game records are writable"
on public.game_records
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "player stats are readable" on public.player_stats;
create policy "player stats are readable"
on public.player_stats
for select
to anon, authenticated
using (true);

drop policy if exists "player stats are writable" on public.player_stats;
create policy "player stats are writable"
on public.player_stats
for all
to anon, authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('wtf-images', 'wtf-images', true)
on conflict (id) do nothing;
