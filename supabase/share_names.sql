-- ============================================================
-- Optional share names for the copied Results text.
--
-- Adds two nullable text columns to public.games. Additive only: no existing
-- row, policy, trigger or function changes, and NULL (the default) means
-- "use the normal category name". Safe to run more than once.
--
-- Run this before deploying the share-name Admin fields if you want to save
-- share names. Until it runs, the app keeps saving puzzles that have no share
-- names exactly as before; saving one with a share name fails with a clear
-- Admin message instead.
-- ============================================================

alter table public.games
  add column if not exists category_a_share_name text,
  add column if not exists category_b_share_name text;
