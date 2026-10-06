# Shared accounts in WTF Trivia

What The Fudge Trivia is game #3 on the Sting Ray shared-account pattern
(Rainbow Categories, Cluevoyance). One sign-in, the shared identity (WorkOS
AuthKit), reached through THIS project's own Supabase Auth as the custom
OIDC provider `custom:platform`.

```
WorkOS global identity  (user_… id; the same person in every game)
        │  standard OIDC, code + PKCE, through this project's Supabase Auth
        ▼
accounts  (user_id = this project's auth user id; global_user_id = the WorkOS id, unique)
        │   the SAME uuid is players.id, so every existing player table
        │   (game_records, player_stats, puzzle_favorites) is the account's history
        ├── admins          which accounts may write official content (0003)
        └── guest_handoffs  one-time codes that let a returning account claim its guest rows

Guest: exactly the game as it always was: an ANONYMOUS Supabase Auth user with
rows of its own, keyed by auth.uid(). Content (`games`) is independent and untouched.
```

The WorkOS id is the cross-game **link**, never a key for gameplay data.
Rainbow holds `accounts(user_id = RAINBOW_LOCAL, global_user_id = user_X)`,
Cluevoyance `accounts(user_id = CLUE_LOCAL, …)`, WTF `accounts(user_id =
WTF_LOCAL, …)`. The local ids differ; the global id is the same; no database
depends on another.

## What is different about WTF

Rainbow's and Cluevoyance's guests were either device-keyed rows (Rainbow) or
browser-only localStorage (Cluevoyance). WTF's guests are **anonymous Supabase
Auth users** who already own server rows (`players`, `game_records`,
`player_stats`, `puzzle_favorites`). Two consequences:

1. **No new history table.** The account IS the player: `ensure_account()`
   writes the `accounts` row and marks the same uuid's `players` row
   `is_guest = false` with the identity-first email. Plays, streak counters,
   favorites and community stats keep working unchanged, for guests and
   accounts alike, through the existing `auth.uid() = player_id` policies.
   `wtf_uid()` (the account boundary) guards only the account-only RPCs.
2. **The guest handoff** replaces Rainbow's device identity and Cluevoyance's
   localStorage import. Leaving for the shared sign-in replaces the anonymous
   session with the account's, so right before leaving the guest asks the
   server for a one-time code (`offer_guest_history`; only its SHA-256 is
   stored; one hour; one live code per guest). The returning account presents
   it: **Add my progress** (`import_guest_history`) moves the guest's rows
   **in place** (same ids), keeps the better play where both played a puzzle,
   unites favorites, recomputes the counters from the merged plays and deletes
   the empty anonymous user; **Start fresh** (`decline_guest_history`) spends
   the code and moves nothing. Either way the decision is final; a failed
   callback leaves the guest exactly as it was.

## Files

| File | Role |
|---|---|
| `supabase/migrations/0001_wtf_baseline.sql` | A: the live schema declared as the hosted project has it (no-ops there). B–G: `accounts`, `wtf_uid()`, `account_email()`, `ensure_account()`, `my_account()`, `ping()`, `admins` + `is_wtf_admin()`, `best_combo()` + `recompute_player_stats()`, `guest_handoffs` + `offer/resolve/import/decline`, `delete_my_account()` / `delete_local_account()`, explicit grants |
| `supabase/migrations/0002_wtf_player_lockdown.sql` | the pre-existing "L1" fix: drops the permissive duplicate policies on `players`, `game_records`, `player_stats`; explicit grants. Required once real emails sit in `players.email` |
| `supabase/migrations/0003_wtf_admin_gate.sql` | OPT-IN: `games` writes and image upload/delete need an admin account; reads stay open. Applied on the hosted project only after Deb's account is granted |
| `supabase/ops/hosted/phase2-install.sql` | GENERATED (`tools/build-phase2-install.mjs`): 0001 B–G + 0002 + ledger rows, one transaction, for the hosted project. Section A and 0003 are deliberately left out |
| `supabase/ops/hosted/live-replica.sql` | GENERATED: section A alone, for the local rehearsal |
| `supabase/seed.sql`, `supabase/config.toml` | local stack: three sample puzzles + a draft; ports 556xx; anonymous sign-ins on; `/auth/callback` allow-listed |
| `src/game/config.js` | environment-driven configuration; `ACCOUNTS_ENABLED`; the session storage key (supabase-js's own default, spelled out, so existing guest sessions survive) |
| `src/account/supabaseClient.js` | the one Supabase client (PKCE, no URL session detection) |
| `src/account/platformSignIn.js` | sign-in (reachability probe, then the handoff offer, then the redirect), callback handling, provider-token removal, `ensureAccount`, `checkIsAdmin`, local sign-out, deletion |
| `src/account/guestHandoff.js` | the pending code in sessionStorage; offer / resolve / import / decline |
| `src/account/safePath.js` | same-origin return path for the round trip |
| `src/account/AuthCallback.jsx`, `ImportPrompt.jsx`, `account.css` | the callback page and the "Bring your progress with you?" prompt |
| `src/main.jsx` | renders `AuthCallback` on `/auth/callback`, the game everywhere else |
| `src/App.jsx` | touch points marked `[accounts]`: config/client imports, `authSignInWithPlatform`, `authSignOutToGuest`, `authResolveAccount`, `loadAppData`, the handlers, `AccountScreen`, the prompt, the Admin gear for admins, Stats copy |
| `vercel.json` | SPA rewrite so `/auth/callback` is served (as `/admin` already was) |
| `tools/workos.mjs` | register a WorkOS Staging application / install the provider (local stack or hosted project), allow-list callbacks |
| `tools/hosted.mjs` | read-only inventory, **content safety snapshot** (`counts`), export, compare, rehearsal/apply with before/after fingerprints, auth config |
| `tools/rehearse-local.mjs` | the local rehearsal: blank → live replica → exported content → install → fingerprint identical |
| `tests/db/accounts.test.mjs`, `tests/db/content-safety.test.mjs` | node:test against the local stack (`npm run test:db`) |
| `src/account/account.test.js` | Vitest unit tests (`npm run test:unit`) |

## Behaviour

**Guest.** Unchanged: the first visit signs in anonymously, plays, counters,
favorites and crowd stats work as today. With accounts off (no
`VITE_PLATFORM_DISCOVERY_URL`) the Account screen says sign-in is not
available in this build; nothing else differs.

**Sign in.** Account screen → Sign In → reachability probe of the discovery
document (8 s; unreachable = "Sign-in is temporarily unavailable", nothing
navigates) → if this guest has plays or favorites, `offer_guest_history`
(best effort; a failure never blocks) → `signInWithOAuth({provider:
'custom:platform', redirectTo: origin + '/auth/callback'})` → hosted sign-in
→ GoTrue callback → `/auth/callback`: PKCE exchange, code stripped from the
address bar, provider token deleted → `ensure_account()`: `ok` /
`not_platform_linked` (local sign-out; "not a WTF Trivia account"; the
browser carries on as a fresh guest) / unavailable (session kept; Try
again). Back to the page the player left. The app reloads as the account:
`players.is_guest = false`, email from the identity, the pending handoff is
resolved and, if valid, the prompt is shown once.

**Old email/password beta users.** The email, password and magic-link screens
are gone. Such an auth user has no `custom:platform` identity, so
`ensure_account` says `not_platform_linked` and the browser becomes a guest.
On the hosted project exactly one such user exists (the owner's own
April test account, no plays).

**Signed-in play.** Through the same tables as a guest; nothing is stored
twice. Stats says "Saved to your account."

**Email.** Display only, from `account_email()` (the provider identity,
refreshed on every sign-in). Never `auth.users.email`, never a key.

**Sign out.** Local only (`signOut({scope:'local'})`); the WorkOS session and
other games are untouched. Any pending handoff is forgotten. The browser then
signs in anonymously again: a brand-new guest.

**Delete account.** `delete_my_account()` removes favorites, plays, counters,
admin rights, the account, the player and the auth user, then rebuilds the
affected puzzles' community stats (the person's finishes leave the crowd
numbers). The WorkOS identity survives; the next sign-in creates a fresh,
empty account with the same `global_user_id`.

**Admin.** Puzzle Studio is unchanged. Its saves already carry the session's
bearer token. Until 0003 is applied the beta password is the only gate (as
today). After 0003 the database refuses content writes and image uploads
from anyone but an account in `admins`; the Admin gear also shows for such
an account; a refused save says so. Grant:
`insert into public.admins (user_id) select user_id from public.accounts where global_user_id = 'user_…';`

**Failure.** Provider down → sign-in says so, guests unaffected. Supabase down
→ the boot error page as before. Callback error → a sentence and a way back;
guest rows untouched. `ensure_account` failing after a good sign-in → session
kept, Try again. Handoff RPC failing → the prompt is asked again next load
(the code lives an hour); import failing → the guest rows stay where they were.

## Configuration (nothing hosted is named in code)

| Key | Purpose |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | the project (already set in Vercel for all three environments); `VITE_SUPABASE_PUBLISHABLE_KEY` is accepted as an alias |
| `VITE_PLATFORM_DISCOVERY_URL` | the shared sign-in's discovery document; empty = accounts off |
| `VITE_ACCOUNTS_ENABLED` | `"false"` = kill switch |
| `VITE_ADMIN_PASSWORD` | Studio's client-side password (unchanged) |

Supabase Auth on the hosted project needs: the custom provider installed by
`tools/workos.mjs hosted register/wire`; Site URL = the live origin; the redirect
allow-list to include exactly `https://<origin>/auth/callback`; **Anonymous
sign-ins ON (must stay on: guests need it)**; manual linking OFF (it is).
Open question for Phase 2: `mailer_autoconfirm` is ON on the hosted project
(the kit recommends Confirm email ON so GoTrue never auto-links to an
unconfirmed same-email user); WTF sends no auth email, so turning autoconfirm
off costs nothing, but it is Deb's call.

## Content safety

Content is one table, `games` (questions embedded as JSON), plus the
`wtf-images` bucket. The account layer adds no FK to `games`, no trigger on
it, no statement against it; deleting players, accounts or handoffs cannot
reach it (`tests/db/content-safety.test.mjs`). `tools/hosted.mjs counts`
fingerprints every row (and the ordered ids separately) so a hosted run can
be checked before and after; `tools/rehearse-local.mjs` proved the install
leaves an exported copy of the live content byte-identical.

## Local development

```
npm install
npm run db:start          # local Supabase on 556xx (Docker)
npx supabase status       # API_URL + ANON_KEY → .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
npm run dev
npm test                  # unit + database tests
npm run db:reset          # back to the seeded state
```

A manual sign-in smoke needs a disposable WorkOS Staging application for the
local callback (`npm run workos -- local register --authkit-domain <staging
domain>` then `local wire`), which is a separate approval; a local mock OIDC
provider does not work (GoTrue refuses non-HTTPS issuers).
