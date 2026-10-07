-- ============================================================
-- Optional wide artwork for each puzzle.
--
-- Adds one nullable text column to public.games: the URL of a wide (about
-- 1200x630) image, separate from the square Home poster in header_image.
-- Players see it as the share image, in Home's Up Next section and as
-- Home's poster on short phone screens. Additive only: no existing row,
-- policy, trigger or function changes, and NULL (the default) means "no
-- wide artwork", so the square poster is used instead. Safe to run more
-- than once.
--
-- Run this before saving wide artwork in Puzzle Studio. Until it runs,
-- puzzles without wide artwork keep saving exactly as before; saving one
-- with wide artwork fails with a clear Admin message instead.
-- ============================================================

alter table public.games
  add column if not exists wide_image text;
