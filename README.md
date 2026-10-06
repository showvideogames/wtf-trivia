# WTF Trivia

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

Add the same environment variables in Vercel for Production, Preview, and Development.

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
