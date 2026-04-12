# WTF Trivia

WTF Trivia is a React + Vite trivia game with:

- a public daily game experience
- an archive/replay flow
- an admin editor for creating and publishing games
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

This app currently uses the public anon key from the browser, so your Row Level Security policies matter. The included schema enables the reads and writes this app expects.

## Notes

- The admin login is still client-side, so `VITE_ADMIN_PASSWORD` is obfuscation rather than true security.
- If you want, the next hardening step is to move admin writes and image uploads behind Vercel serverless functions with a real server-side secret.
