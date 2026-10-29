# WTF Trivia

## Start here for the next session

This is **What The Fudge Trivia**. Players assign each clue to one of two categories, reveal the answer, then compare and share results; see [player instructions](src/HowToPlay.jsx). Read [shared accounts](docs/SHARED-ACCOUNTS.md), the [pre-launch checklist](docs/pre-launch-checklist.md), and the [puzzle ID cutover record](supabase/puzzle_id_cutover/PLAN.md). Use the root app; the nested `wtf-trivia/README.md` is not the primary entry point. The React/Vite app, Studio and gameplay are in `src/`; `supabase/migrations/` and `tools/hosted.mjs` define database changes and content-safety tooling.

### Status checked 2026-10-29

`main` is `c349a5cc9b24d5b277336b31a8e7c77cd8088435`; GitHub records a [successful Production deployment](https://api.github.com/repos/showvideogames/wtf-trivia/deployments/7269941420/statuses) for it. The recent merged work includes picture quizzes, desktop layout fitting and the temporary beta editing override. That establishes source/release history, not the override's current hosted flag or expiry.

The pre-launch checklist explicitly requires ending the beta editing override before launch. Its older exposure, draft privacy and concurrent-finish items need current verification; do not label them fixed or current exploitable bugs from the checklist alone. Published/played content stability matters because edits can invalidate saved picks, results and links. Studio editing is not authorization to alter approved content.

### Checks and release boundary

Use the local setup below. `npm run test:unit` and `npm run build` do not establish hosted account acceptance; `npm test` also needs the disposable local database. `npm run lint` is configured. No game suites, migrations or live account tests were run in this documentation pass.

WorkOS supplies shared identity through this game's Supabase Auth; guests have anonymous sessions, and row ownership is enforced in the database. Configure Preview and Production deliberately: identical variable names do not require identical backend values. The old instruction to copy the same environment everywhere could couple preview writes to live data; actual hosting values were not inspected. Use a disposable backend for tests that create games or player records.

Before a later release, resolve the checklist items with evidence, record the exact deployment and schema state, and retain the previous deployment. A frontend rollback does not undo content edits or database flags. Content snapshots are not proof of complete player/account/storage recovery; confirm backup scope and rehearse restoration separately. Keep content queue ownership and publish approval explicit.

WTF Trivia is a React + Vite trivia game with:

- a public daily game experience
- an archive/replay flow
- an admin editor (Puzzle Studio) for creating and publishing games
- guest-first Supabase Auth (anonymous guests) with ONE sign-in: the shared
  Sting Ray account (WorkOS AuthKit through this project's Supabase Auth);
  see [docs/SHARED-ACCOUNTS.md](docs/SHARED-ACCOUNTS.md)
- Supabase persistence for games, players, records, stats, favorites and uploaded images

## Local setup

1. Create `.env` from `.env.example` (git-ignored).
2. Fill in:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (a local stack: `npm run db:start`, then `npx supabase status`)
   - `VITE_PLATFORM_DISCOVERY_URL` (leave empty for a guest-only build)
   - `VITE_ADMIN_PASSWORD`
3. Install dependencies with `npm install`.
4. Run locally with `npm run dev`. With no Supabase values the app runs an offline preview with a demo puzzle.
5. `npm test` runs the unit tests and the database tests (the latter need the local stack).

## Vercel setup

This repo is configured for Vercel with [vercel.json](vercel.json), which forces:

- framework: `vite`
- build command: `npm run build`
- output directory: `dist`
- SPA rewrites for `/admin` and `/auth/callback`

Set the required variable names separately for Production, Preview and Development.
Use isolated backend values for write-testing environments; do not blindly copy production values.

Production address: `https://whatthefudge.gg` (Vercel project `wtf-trivia`, not `wtf-triviaold`). `www.whatthefudge.gg` redirects to it with a 308. `wtf-trivia.vercel.app` keeps serving the app so guests who started there keep their session.

Brand icons live in `public/` (`favicon.ico` with 16/32/48, `favicon-96x96.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest`). The approved source artwork is `design/brand-icon-master.webp`.

## Supabase setup

The schema lives in `supabase/migrations/` (the CLI applies it to a local stack
with `npm run db:start` / `npm run db:reset`). `supabase/schema.sql` is the
pre-migration snapshot kept for reference. The hosted project is changed only
through `tools/hosted.mjs` with its content-safety checks (see
[docs/SHARED-ACCOUNTS.md](docs/SHARED-ACCOUNTS.md)).

In `Authentication > Providers`:

- `Anonymous Sign-Ins` must stay enabled (guests)
- the custom OIDC provider `custom:platform` is installed by `tools/workos.mjs`, never by hand

In `Authentication > URL Configuration`, the site URL and `https://<site>/auth/callback` must be allow-listed.

Row Level Security is the ownership boundary: guests and accounts alike have a
real session and only touch their own rows; community stats are public.

## Notes

- The admin login is still client-side, so `VITE_ADMIN_PASSWORD` is obfuscation rather than true security. The database-enforced rule (content writes need an admin account) is `supabase/migrations/0003_wtf_admin_gate.sql`, applied to the hosted project only once an admin account exists.
