# Pre-launch checklist

Things that must be done, or decided, before What The Fudge Trivia launches.
Tick each one off in the PR that does it.

## Must do

- [ ] **Turn off the beta editing override** (`supabase/migrations/0006_beta_editing_override.sql`).
  While it is on, Studio admins can add, delete, shuffle and reorder the questions of published, live, retired and played puzzles. Those edits can make old scores, Nerd Mode picks, puzzle stats and shared result links stop matching their questions.
  1. In the hosted WTF project's SQL Editor run:
     ```sql
     update public.wtf_flags set enabled = false, expires_at = null, updated_at = now()
     where name = 'beta_editing';
     ```
  2. Check that it is off (expect `false`):
     ```sql
     select public.wtf_beta_editing_active();
     ```
  3. In the Studio, open today's puzzle: the "Beta editing enabled" notice is gone, and Add, Delete, Shuffle, drag and Move up/down are locked with the reason shown.

  The override also switches itself off at its `expires_at`. Turning it off is what restores the protection: the 0005 lock stays installed throughout. If the beta data is reset before launch, do it as its own reviewed step. This override never deletes player data.

## Carried over from earlier work (check each is still open)

- [ ] Puzzle-id migration cleanup (the leftovers noted when the puzzle-id cutover was done).
- [ ] Public email/play exposure fix (drafted as "L1", not yet applied).
- [ ] Draft privacy audit: what a draft or future puzzle exposes through the public API and the Archive.
- [ ] Audited sweep for orphaned storage files.
- [ ] Simultaneous finishes: the puzzle stats rebuild can make a later player's finished-game save fail.
- [ ] React Compiler lint silently skips components that contain `try…finally`.
