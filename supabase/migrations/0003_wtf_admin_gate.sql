-- ============================================================================
--  WTF Trivia: the admin gate (OPT-IN; apply to the hosted project only after
--  Deb's account exists AND is in public.admins AND she has signed in once)
-- ============================================================================
--  Today Puzzle Studio saves from the browser with the public key behind a
--  client-side password: anyone can insert, edit and delete puzzles and upload
--  or delete images. The account boundary makes a cheap server-side rule
--  possible: content writes need an ADMIN ACCOUNT.
--
--  Reading stays exactly as it is (every status, as the app loads today).
--  Zero rows change. Deliberately a separate migration: from the moment it is
--  applied, a Studio save from a browser that is not signed in as an admin
--  fails with "permission denied", so it must not land before the admin
--  account is ready. Undo: re-create the two "games are ..." policies.
-- ============================================================================

-- The hosted tooling (tools/hosted.mjs) refuses to apply this file unless an
-- admin account exists; a blank local stack applies it so the tests can prove
-- the gate. Here it only says so.
do $$
begin
  if not exists (select 1 from public.admins) then
    raise notice '0003: no admin account exists yet; Studio saves need one (insert into public.admins ...)';
  end if;
end $$;

-- games: the beta-era open policies go; reads stay open; writes need an admin account
drop policy if exists "Anyone can delete games"             on public.games;
drop policy if exists "Anyone can insert games"             on public.games;
drop policy if exists "Anyone can read all games for admin" on public.games;
drop policy if exists "Anyone can read published games"     on public.games;
drop policy if exists "Anyone can update games"             on public.games;
drop policy if exists "games are readable"                  on public.games;
drop policy if exists "games are writable"                  on public.games;

create policy games_read_all     on public.games for select to anon, authenticated using (true);
create policy games_admin_insert on public.games for insert to authenticated with check (public.is_wtf_admin());
create policy games_admin_update on public.games for update to authenticated using (public.is_wtf_admin()) with check (public.is_wtf_admin());
create policy games_admin_delete on public.games for delete to authenticated using (public.is_wtf_admin());

revoke all on table public.games from anon, authenticated;
grant select on table public.games to anon, authenticated;
grant insert, update, delete on table public.games to authenticated;   -- RLS: admins only

-- images: reading stays public; uploading and deleting need an admin account
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "Anyone can upload images" on storage.objects;
    drop policy if exists "Anyone can delete images" on storage.objects;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins can upload images') then
      create policy "Admins can upload images" on storage.objects for insert to authenticated with check (bucket_id = 'wtf-images' and public.is_wtf_admin());
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins can delete images') then
      create policy "Admins can delete images" on storage.objects for delete to authenticated using (bucket_id = 'wtf-images' and public.is_wtf_admin());
    end if;
  end if;
end $$;
