-- ============================================================
-- Optional category subtitles for the gameplay matchup banner.
--
-- Adds two nullable text columns to public.games: a second line shown under
-- each category name in the banner above the question (e.g. "Song" under
-- "Led Zeppelin"). Additive only: no existing row, policy, trigger or
-- function changes, and NULL (the default) means "no subtitle". Safe to run
-- more than once.
--
-- Run this before (or right after) deploying the subtitle fields in Puzzle
-- Studio if you want to save subtitles. Until it runs, the app keeps saving
-- puzzles without subtitles exactly as before; saving one with a subtitle
-- fails with a clear Admin message instead.
-- ============================================================

alter table public.games
  add column if not exists category_a_subtitle text,
  add column if not exists category_b_subtitle text;
