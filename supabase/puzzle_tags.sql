-- ============================================================
-- Topic tags for puzzles (Admin "Topics", Archive topic menu and search).
--
-- Adds one text[] column to public.games holding stable topic ids from
-- src/topics.js (e.g. {music,gaming}). Additive only: no other column, row,
-- policy, trigger or function changes. Existing puzzles get the empty array
-- default, which means "no topics". Safe to run more than once.
--
-- Until it runs, the app keeps saving untagged puzzles exactly as before;
-- saving a puzzle with a topic selected fails with a clear Admin message.
-- ============================================================

alter table public.games
add column if not exists tags text[] not null default '{}'::text[];
