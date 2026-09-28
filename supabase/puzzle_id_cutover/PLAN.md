# Puzzle-ID cutover — final plan

Status: implemented and tested offline. **Nothing applied to the live database,
nothing committed, pushed, merged or deployed.**

## Design

* **A puzzle's id (`games.id`) is the permanent identity of its results.** Every play
  (`game_records.puzzle_id`) and every community-stats row (`puzzle_stats.puzzle_id`)
  points at it.
* **The date only schedules.** `games.date` decides which published puzzle is "today".
  A play keeps `game_date` as a snapshot of the day it was played, and it is never used
  to look anything up.
* **Moving a puzzle's date** never moves, loses, mixes or resets its results.
* **Two puzzles on the same date never share results.** Stats, crowd numbers, share
  text, Home and Archive all key on the puzzle id.
* **One play per player per puzzle.** At most one published puzzle per date, enforced by
  the database.
* **Deleting:** drafts and published puzzles with **zero plays** can be deleted. Once a
  puzzle has **any** play (even an unfinished one), the database refuses and Admin says
  to **Retire** it.
* **Retired puzzles:**
  * are never today's puzzle, and their date is free again;
  * keep their plays and stats;
  * appear in a player's Archive only if that player played them (score shown, marked
    "Retired", no replay);
  * can be published again later.
* **Simultaneous finishes:** stats are rebuilt per puzzle, one finish at a time. A second
  finish waits a moment instead of failing. This fixes follow-up #7, where the current
  live function drops the second player's save.
* **Not changed by this project:** who can edit puzzles (the `games` policies). That is
  the pre-launch Admin-security project.

## Live rollout, one step at a time

1. **V0.** At a quiet hour, run `V_verify_READ_ONLY.sql` → V0 (read-only) and keep the
   numbers.
2. **C1.** Run `C1_cutover_NOT_YET_APPLIED.sql`. It is one transaction: all or nothing.
   Check its report, then run **V2**; every `ok` must be true. The current production
   app keeps working on C1.
3. **Preview testing.** Test the PR's Vercel Preview: play, Results/Crowd Showdown,
   Home share, Archive, a replay, and Admin Retire/Delete. The Preview uses the **live**
   database, so only test it *after* C1; before C1 it can't start games.
4. **Merge and deploy** to production, then repeat the quick checks and **V2**.
5. **C2, later.** A few hours after the deploy, run `C2_contract_NOT_YET_APPLIED.sql`,
   then **V2**.
6. **Synthetic seed.** Run `results_test_seed.sql` once, then
   `results_test_verify.sql`. Before launch, remove it with `results_test_cleanup.sql`.

Between steps 2 and 5, **don't move or replace a puzzle on a date people have already
played**. The old one-play-per-player-per-date rule stays until C2, so the current app
keeps working meanwhile. Until C2, players who played the old puzzle couldn't start the
replacement that day.

`L1_security_lockdown` (player emails and plays) is independent of this sequence.

## Rollback

* Before step 4: `R_rollback` → R1 returns to the old by-date model. R1-DATA can put
  back the cleared test data if nobody has played since.
* After step 4: redeploy the previous app build first. C1 works with both app versions.
* After step 5: R2, then R1. R2 refuses if any player has two plays on one date.

## Evidence

* **Full suite run on a throwaway Supabase Postgres 17.6 container** (the live version)
  and on PGlite: 5 scenarios each, all passing. Covered:
  * the current app and the new app on C1;
  * C2, the rollbacks, and the seed/verify/cleanup scripts;
  * moving a puzzle, replacing a day's puzzle, retire, and the delete rules;
  * a wrong-owner abort.
* **Real simultaneous finishes:**
  * the current live function fails the second save (`duplicate key … puzzle_stats_pkey`);
  * after C1, the second save waits and succeeds;
  * 20 players finishing at the same instant all saved, each counted once;
  * the same holds after C2.
* **App:** 184/184 tests pass. Lint has one warning fewer than `main` and no new
  findings. The build succeeds.
* **Offline preview:**
  * play → Results → Home → Archive;
  * moving a played puzzle to another date keeps its 4/13;
  * putting another puzzle on today gives a fresh game with its own 3/6;
  * the played puzzle can't be deleted, and retiring it keeps the player's 4/13 in
    Archive.
