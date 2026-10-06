-- ============================================================
-- Category display names for Puzzle Studio.
--
-- Each category has one name (category_a / category_b: the matchup name)
-- plus three optional display overrides, all nullable text on public.games:
--   category_X_subtitle     second line in the gameplay matchup banner
--                           (from supabase/category_subtitles.sql)
--   category_X_button_name  label on the answer-choice button; NULL means
--                           "use the category name" (new here)
--   category_X_share_name   name in the copied share text; NULL means
--                           "use the category name"
--                           (from supabase/share_names.sql)
--
-- This one script covers all six columns, so it is all you need even if
-- share_names.sql or category_subtitles.sql never ran. Additive only: no
-- existing row, value, policy, trigger or function changes, and every new
-- value starts NULL, which keeps today's behaviour. Safe to run more than
-- once.
--
-- The final NOTIFY tells the Supabase API (PostgREST) to reload its schema
-- cache right away. Without it, saves can keep failing for a while with
-- "Could not find the 'category_a_subtitle' column of 'games' in the schema
-- cache" even though the column exists.
-- ============================================================

alter table public.games
  add column if not exists category_a_share_name text,
  add column if not exists category_b_share_name text,
  add column if not exists category_a_subtitle text,
  add column if not exists category_b_subtitle text,
  add column if not exists category_a_button_name text,
  add column if not exists category_b_button_name text;

notify pgrst, 'reload schema';
