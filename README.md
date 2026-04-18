# WTF Trivia

WTF Trivia is a React + Vite trivia game with:

- a public daily game experience
- an archive/replay flow
- an admin editor for creating and publishing games
- guest-first Supabase Auth with optional email upgrade later
- Supabase persistence for games, players, records, stats, and uploaded images

## Local setup

1. Create `.env.local` from `.env.example`.
2. Fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_PASSWORD`
3. Install dependencies with `npm install`.
4. Run locally with `npm run dev`.

## Vercel setup

This repo is configured for Vercel with [vercel.json](C:\Users\leviw\wtf-trivia-fix\wtf-trivia\vercel.json), which forces:

- framework: `vite`
- build command: `npm run build`
- output directory: `dist`

Add the same environment variables in Vercel for Production, Preview, and Development.

## Supabase setup

Run the SQL in [supabase/schema.sql](C:\Users\leviw\wtf-trivia-fix\wtf-trivia\supabase\schema.sql) in the Supabase SQL editor.

In `Authentication > Providers`, enable:

- `Anonymous Sign-Ins`
- `Email` sign-in

In `Authentication > URL Configuration`, add your site URL and any local dev URL you use so magic-link redirects land back in the app.

This app now uses Supabase Auth from the browser, so Row Level Security is the real ownership boundary. The included schema is designed for:

- guest players getting an anonymous auth user automatically
- upgrading that guest later with an email login
- player-owned game records and lifetime stats tied to `auth.uid()`
- public aggregate puzzle stats for results pages

## Notes

- The admin login is still client-side, so `VITE_ADMIN_PASSWORD` is obfuscation rather than true security.
- The current admin write path is still browser-side. Long term, the next hardening step is moving admin writes and image uploads behind Vercel serverless functions with a real server-side secret or a proper admin role.
