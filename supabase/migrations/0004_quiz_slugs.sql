-- ============================================================
-- 0004  Public quiz URLs: games.slug  (/quiz/<slug>)
--
-- Every quiz gets a permanent, readable public name beside its id:
--   https://whatthefudge.gg/quiz/taylor-swift-song-or-skyrim-city
-- games.id stays the identity everything else points at (plays, favorites,
-- stats, /puzzle/<id> links); the slug is only the public address.
--
-- ADDITIVE AND BACKWARD-COMPATIBLE
--   * one nullable text column, a format check, a unique index, a trigger
--     and two functions; no existing column, policy or grant changes;
--   * the app works without this migration (it derives the same slugs from
--     titles in src/quizSlug.js) and with it (it reads the stored ones);
--   * safe to run more than once.
--
-- WHAT IT DOES
--   1. public.wtf_slugify(title): "Taylor Swift Song OR Skyrim City?" ->
--      "taylor-swift-song-or-skyrim-city". Character for character the rules
--      of slugifyTitle in src/quizSlug.js (tests/db/quiz-slugs.test.mjs
--      checks they agree).
--   2. games.slug, lowercase words joined by single hyphens, unique.
--   3. Trigger games_quiz_slug:
--        - a quiz that is not a draft and has no slug gets one from its
--          title, made unique with -2, -3, ... (so a quiz gets its URL when
--          it is first published; a draft's can still be chosen in Studio);
--        - once a published (or retired) quiz has a slug it never changes:
--          a save without one keeps it, a different one is refused
--          (games_slug_locked), so links already shared stay valid.
--   4. Backfill: every existing published and retired quiz without a slug
--      gets one -- published first, then by date and id, the exact order
--      src/quizSlug.js uses for quizzes without a stored slug, so every
--      /quiz/<slug> link handed out before this runs keeps working after.
--      Drafts stay empty until they are published (or given one in Studio).
--
-- APPLYING IT (not automatic): on the hosted project, through
--   node tools/hosted.mjs sql --file supabase/migrations/0004_quiz_slugs.sql
-- first (a rehearsal: BEGIN ... ROLLBACK), then again with --apply. The run
-- reports CONTENT MOVED: expected here, as the backfill writes each
-- published quiz's slug and nothing else.
--
-- ROLLBACK (only if needed; every /quiz/<slug> link keeps working, derived
-- from titles again):
--   drop trigger if exists games_quiz_slug on public.games;
--   drop function if exists public.games_quiz_slug();
--   drop function if exists public.wtf_backfill_quiz_slugs();
--   alter table public.games drop column if exists slug;
--   drop function if exists public.wtf_slugify(text);
-- ============================================================

-- 1. The slug rules. Accented letters keep their letter; the uppercase
-- half of the table covers a database whose lower() leaves them as they are.
create or replace function public.wtf_slugify(title text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select rtrim(left(btrim(regexp_replace(
    replace(replace(replace(
      translate(lower(coalesce(title, '')),
        'àáâãäåāăąçćčďèéêëēėęěìíîïīįłñńňòóôõöøōőřśšşťùúûüūůűųýÿžźżÀÁÂÃÄÅĀĂĄÇĆČĎÈÉÊËĒĖĘĚÌÍÎÏĪĮŁÑŃŇÒÓÔÕÖØŌŐŘŚŠŞŤÙÚÛÜŪŮŰŲÝŸŽŹŻ',
        'aaaaaaaaacccdeeeeeeeeiiiiiilnnnoooooooorssstuuuuuuuuyyzzzaaaaaaaaacccdeeeeeeeeiiiiiilnnnoooooooorssstuuuuuuuuyyzzz'),
      '''', ''), '’', ''), '&', ' and '),
    '[^a-z0-9]+', '-', 'g'), '-'), 80), '-')
$$;

comment on function public.wtf_slugify(text) is 'A quiz title as a URL slug; the same rules as slugifyTitle in src/quizSlug.js.';

-- 2. The column.
alter table public.games add column if not exists slug text;

alter table public.games drop constraint if exists games_slug_format;
alter table public.games add constraint games_slug_format
  check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100));

create unique index if not exists games_slug_key on public.games (slug);

comment on column public.games.slug is 'The quiz''s public URL name (/quiz/<slug>). Set on first publish or in Studio while a draft; permanent once published.';

-- 3. Set on publish, permanent after.
create or replace function public.games_quiz_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  if tg_op = 'UPDATE' and old.slug is not null and old.status <> 'draft' then
    if new.slug is null then
      new.slug := old.slug;
    elsif new.slug <> old.slug then
      raise exception 'games_slug_locked: quiz % is published as /quiz/%; its URL can''t change.', old.id, old.slug
        using errcode = 'check_violation';
    end if;
  end if;
  if new.slug is null and new.status <> 'draft' then
    base := coalesce(nullif(public.wtf_slugify(new.theme_title), ''), 'quiz');
    candidate := base;
    while exists (select 1 from public.games g where g.slug = candidate and g.id <> new.id) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    new.slug := candidate;
  end if;
  return new;
end
$$;

drop trigger if exists games_quiz_slug on public.games;
create trigger games_quiz_slug
  before insert or update on public.games
  for each row execute function public.games_quiz_slug();

-- 4. The backfill, in src/quizSlug.js's order (collate "C": code-unit order,
-- as JavaScript compares strings).
create or replace function public.wtf_backfill_quiz_slugs()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r record;
  base text;
  candidate text;
  n integer;
  filled integer := 0;
begin
  for r in
    select id, theme_title from public.games
    where slug is null and status <> 'draft'
    order by (status = 'published') desc, date collate "C", id collate "C"
  loop
    base := coalesce(nullif(public.wtf_slugify(r.theme_title), ''), 'quiz');
    candidate := base;
    n := 1;
    while exists (select 1 from public.games g where g.slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    update public.games set slug = candidate where id = r.id;
    filled := filled + 1;
  end loop;
  return filled;
end
$$;

revoke all on function public.wtf_backfill_quiz_slugs() from public, anon, authenticated;
revoke all on function public.games_quiz_slug() from public, anon, authenticated;

select public.wtf_backfill_quiz_slugs() as quizzes_given_a_slug;
