-- ============================================================
-- Optional silhouette / Tomorrow-teaser artwork for each puzzle.
--
-- Adds one nullable text column to public.games: the URL of a wide (about
-- 1200x630) silhouette image used only by Home's Up Next / Tomorrow teaser.
-- When NULL (the default) the teaser uses the puzzle's wide artwork.
-- Additive only: no existing row, policy, trigger or function changes.
-- Safe to run more than once.
--
-- Run this before saving silhouette artwork in Puzzle Studio. Until it runs,
-- puzzles without silhouette artwork keep saving exactly as before.
-- ============================================================

alter table public.games
  add column if not exists silhouette_image text;
