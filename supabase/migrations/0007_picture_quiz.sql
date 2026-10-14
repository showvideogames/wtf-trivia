-- ============================================================
-- 0007  Picture quizzes: games.picture_quiz
--
-- A quiz-level option, off by default. In a picture quiz each question
-- shows an uploaded picture (questions[].questionImage, with a neutral
-- description in questions[].questionImageAlt) in place of its name; the
-- name (questions[].itemText) is shown only after the player answers. The
-- per-question fields live in the existing questions jsonb, so this adds
-- only the flag.
--
-- ADDITIVE AND BACKWARD-COMPATIBLE
--   * one boolean column, not null, default false: every existing quiz
--     reads as "not a picture quiz" and plays exactly as before;
--   * no existing column, policy, grant, trigger or function changes. The
--     column is covered by the table-level grants from 0003 (select for
--     anon and authenticated; insert/update for admins through RLS);
--   * the app works without it: a quiz that isn't a picture quiz never
--     sends the column (src/gameRow.js), and saving a picture quiz before
--     this runs is refused with a message naming this file;
--   * safe to run more than once.
--
-- APPLYING IT (not automatic): on the hosted project, in the SQL Editor or
-- through
--   node tools/hosted.mjs sql --file supabase/migrations/0007_picture_quiz.sql
-- first (a rehearsal: BEGIN ... ROLLBACK), then again with --apply.
-- ============================================================

alter table public.games
  add column if not exists picture_quiz boolean not null default false;

comment on column public.games.picture_quiz is
  'Picture quiz: each question shows questions[].questionImage instead of its name, which is revealed after the answer.';
