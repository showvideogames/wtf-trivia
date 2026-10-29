# Atomic completion: backend preparation, not a release

Migration 0008 is unapplied to hosted databases. This draft adds two RPCs and local database tests; it deliberately does not switch App.jsx to use them. Merging or deploying the frontend alone does not fix the remaining completion/stats consistency gap. Do not apply the migration without separate database/security release review.

## Existing failure and new contract

App.jsx currently completes game_records, reads player_stats, then upserts incremented counters. A lost response followed by retry can count one finish twice. A failure between writes leaves a completed game missing from totals. Two overlapping completions can overwrite each other's increments. A delayed older finish can overwrite the latest played date. PR77 fixes session/UI races, not these database consistency failures.

complete_my_game(_puzzle_id, _answers, _score) derives the owner from auth.uid(), locks that player's row, then locks their existing puzzle record. The first completed record wins; retry returns the same committed record rather than overwriting it. Completion, community trigger and canonical player stats recomputation share one transaction. A failure aborts all of them. A client must retry the same RPC after an uncertain response, use the returned record, and never fall back to the old incremental path after an RPC error.

my_reconciled_player_stats() takes the same player lock and rebuilds only the caller's stats from completed records. It returns null when there are none. It is a write RPC, not a read-only endpoint. Neither RPC accepts a player ID. Anonymous authenticated guests and signed-in accounts both own players via auth.uid(). Unauthenticated callers cannot execute either function. Existing grants, RLS, scoring trust and import functions remain unchanged; this is not an anti-cheat change.

Both RPCs reuse recompute_player_stats exactly: totals include every completed record, dates are distinct for streaks, best combo comes from answers, current streak ends at the most recent completed game date (not today). Legacy completed records remain unchanged even if their old answer payload is incomplete. Existing malformed date behavior is retained: a date that matches the baseline regex but cannot cast to date aborts recomputation and thus a new completion. Inspect such data only under a separately authorized release/data plan; no bulk repair is included.

## Compatibility boundary and rollout

1. Review migration, function privileges, local PostgreSQL test results and production schema drift before applying anything. No automatic deployment workflow applies this migration.
2. Apply only to the separately approved WTF backend, then verify function availability without creating live gameplay fixtures. Existing clients continue unchanged.
3. A separate frontend change must use the existing original-owner bound request for the completion RPC, publish returned stats only to the current UI owner, and use the reconciliation RPC on account/stat reload. It must preserve the synchronous Results transition and retry affordance from PR77. Gate that change off by default until schema availability is verified.
4. Mixed old clients still directly PATCH records and upsert cached counters. They do not take the new player lock, can overwrite completed records/counters, and are NOT covered by the atomic/idempotent guarantee. A new reconciliation repairs the aggregate at its transaction snapshot, but an old writer can corrupt it again afterwards. Existing guest import also does not participate in the new player lock. Account deletion/import overlapping completion needs separate integration testing and coordination before a system-wide guarantee.
5. A strict cutover needs a separately reviewed strategy for retiring old clients, restricting direct completion/stats writes, and coordinating import. Do not revoke existing privileges in this additive migration: that would break old clients. No claim of portfolio-wide or mixed-client atomicity is made.

Rollback before client adoption: leave these unused functions installed; no data backfill occurred. After client adoption, disable the new client path first and revert code if needed; the old path's known consistency gaps return. Dropping the two functions is optional only after confirming no callers remain and obtaining database change approval. Never roll back by deleting completed games or overwriting totals from browser snapshots.

## Verification

`npm run db:start && npm run db:reset && npm run test:db:completion` uses the existing local Supabase/Docker harness. CI starts an ephemeral PostgreSQL 17 stack with fixture auth users; it needs no repository secrets or hosted connection. Tests cover retries, concurrent finishes, rollback on aggregate failure, ownership, guests/accounts, legacy streak semantics and reconciliation after legacy writes. Concurrent RPC tests exercise real PostgreSQL but do not prove arbitrary legacy/import interleavings safe.

The development Mac has no Docker, so these database tests cannot run there. CI results must be checked before approving this draft. Real hosted sign-in, token expiry during a retry, multiple browser/device flows and rollout remain unverified.
