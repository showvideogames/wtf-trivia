-- Backend preparation only. Adds RPCs and coordinates existing handoff/import/
-- deletion locks. Existing clients and table grants are unchanged. See docs/atomic-completion-rollout.md before any hosted rollout.
create function public.complete_my_game(_puzzle_id text, _answers jsonb, _score integer)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  _uid uuid := auth.uid();
  _record public.game_records%rowtype;
  _stats jsonb;
begin
  if _uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Serialize all cooperating completion/reconciliation requests for one
  -- owner, including different puzzles. Never accept an owner from the caller.
  perform 1 from public.players where id = _uid for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  select * into _record from public.game_records
    where player_id = _uid and puzzle_id = _puzzle_id for update;
  if not found then
    raise exception 'Game record not found' using errcode = 'P0002';
  end if;

  -- The first committed finish wins. A lost-response retry returns that finish
  -- even if its payload differs. Preserve already completed legacy records.
  if not _record.completed then
    if _answers is null or jsonb_typeof(_answers) <> 'array' then
      raise exception 'Answers must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(_answers) <> _record.total_questions
       or _score is null or _score < 0 or _score > _record.total_questions then
      raise exception 'Incomplete answers or invalid score' using errcode = '22023';
    end if;
    update public.game_records
      set answers = _answers, score = _score, completed = true, completed_at = now()
      where id = _record.id returning * into _record;
  end if;

  -- Reuse import's canonical totals/combo/streak definitions. Any error rolls
  -- back BOTH the finish (and its community trigger) and the player aggregate.
  perform public.recompute_player_stats(_uid);
  select to_jsonb(s) into _stats from public.player_stats s where player_id = _uid;
  return jsonb_build_object('record', to_jsonb(_record), 'stats', _stats);
end;
$$;

create function public.my_reconciled_player_stats()
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  _uid uuid := auth.uid();
  _stats jsonb;
begin
  if _uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform 1 from public.players where id = _uid for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  perform public.recompute_player_stats(_uid);
  select to_jsonb(s) into _stats from public.player_stats s where player_id = _uid;
  return _stats; -- no completed records => null, matching recompute semantics
end;
$$;

revoke all on function public.complete_my_game(text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.my_reconciled_player_stats() from public, anon, authenticated;
grant execute on function public.complete_my_game(text, jsonb, integer) to authenticated;
grant execute on function public.my_reconciled_player_stats() to authenticated;

-- Existing consent/merge/deletion semantics and grants stay unchanged.
-- Replace only transaction coordination; CREATE OR REPLACE preserves ACLs.
create or replace function public.offer_guest_history()
returns table(outcome text, code text, plays integer, finished integer, current_streak integer, longest_streak integer, favorites integer)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  _uid uuid := auth.uid();
  _code text;
  _s record;
begin
  if _uid is null then
    return query select 'not_signed_in'::text, null::text, 0, 0, 0, 0, 0;
    return;
  end if;
  -- Parent before handoff rows: consistent with import and deletion.
  perform 1 from public.players where id = _uid for update;
  if not found then
    return query select 'no_history'::text, null::text, 0, 0, 0, 0, 0;
    return;
  end if;
  -- Only an anonymous guest that is not an account can hand anything over.
  if exists (select 1 from public.accounts a where a.user_id = _uid)
     or not exists (select 1 from auth.users u where u.id = _uid and u.is_anonymous) then
    return query select 'not_a_guest'::text, null::text, 0, 0, 0, 0, 0;
    return;
  end if;

  select * into _s from public.guest_history_summary(_uid);
  if _s.plays = 0 and _s.favorites = 0 then
    return query select 'no_history'::text, null::text, 0, 0, 0, 0, 0;
    return;
  end if;

  -- 192 random bits, URL-safe; only its hash is kept.
  _code := translate(rtrim(encode(gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  delete from public.guest_handoffs where guest_player_id = _uid;
  insert into public.guest_handoffs (code_hash, guest_player_id)
  values (encode(digest(_code, 'sha256'), 'hex'), _uid);

  return query select 'ok'::text, _code, _s.plays, _s.finished, _s.current_streak, _s.longest_streak, _s.favorites;
end;
$$;

create or replace function public.import_guest_history(_code text)
returns table(outcome text, plays_moved integer, plays_dropped integer, favorites_moved integer)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  _uid uuid := public.wtf_uid();
  _h public.guest_handoffs;
  _guest uuid;
  _conflicts text[];
  _moved integer := 0;
  _dropped integer := 0;
  _favs integer := 0;
  _pid text;
begin
  if _uid is null then
    return query select 'not_signed_in'::text, 0, 0, 0;
    return;
  end if;
  if _code is null or length(_code) < 16 or length(_code) > 128 then
    return query select 'invalid'::text, 0, 0, 0;
    return;
  end if;
  -- First discover the guest WITHOUT locking a child row. Then take both
  -- parent locks in UUID order before locking/revalidating the one-time code.
  select * into _h from public.guest_handoffs h where h.code_hash = encode(digest(_code, 'sha256'), 'hex');
  if not found then
    return query select 'invalid'::text, 0, 0, 0;
    return;
  end if;
  _guest := _h.guest_player_id;
  perform 1 from public.players where id in (_uid, _guest) order by id for update;
  -- The account may have been deleted while waiting for the locks.
  if not exists (select 1 from public.players where id = _uid)
     or public.wtf_uid() is distinct from _uid then
    return query select 'not_signed_in'::text, 0, 0, 0;
    return;
  end if;
  select * into _h from public.guest_handoffs h
    where h.code_hash = encode(digest(_code, 'sha256'), 'hex')
      and h.guest_player_id = _guest for update;
  if not found then
    return query select 'invalid'::text, 0, 0, 0;
    return;
  end if;
  if _h.expires_at < now() then
    delete from public.guest_handoffs where code_hash = _h.code_hash;
    return query select 'expired'::text, 0, 0, 0;
    return;
  end if;
  _guest := _h.guest_player_id;
  if _guest = _uid or exists (select 1 from public.accounts a where a.user_id = _guest) then
    delete from public.guest_handoffs where code_hash = _h.code_hash;
    return query select 'invalid'::text, 0, 0, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wtf_handoff:' || _guest::text, 0));
  -- The code is single-use whatever happens below.
  delete from public.guest_handoffs where guest_player_id = _guest;

  -- Community stats: rebuilt once per affected puzzle at the end, not per row.
  perform set_config('wtf.defer_stats', 'on', true);

  select array_agg(distinct g.puzzle_id order by g.puzzle_id) into _conflicts
    from public.game_records g
    join public.game_records a on a.puzzle_id = g.puzzle_id and a.player_id = _uid
   where g.player_id = _guest;

  -- Keep the better play per conflicting puzzle; drop the other.
  with both_sides as (
    select g.puzzle_id, g.id as guest_id, a.id as account_id,
           (g.completed and not a.completed) or (g.completed = a.completed and g.score > a.score) as guest_wins
      from public.game_records g
      join public.game_records a on a.puzzle_id = g.puzzle_id and a.player_id = _uid
     where g.player_id = _guest
  )
  delete from public.game_records r
   using both_sides b
   where r.id = case when b.guest_wins then b.account_id else b.guest_id end;
  get diagnostics _dropped = row_count;

  update public.game_records set player_id = _uid where player_id = _guest;
  get diagnostics _moved = row_count;

  -- Favorites: a puzzle both favorited counts once (the trigger decrements).
  delete from public.puzzle_favorites f
   where f.player_id = _guest
     and exists (select 1 from public.puzzle_favorites a where a.player_id = _uid and a.puzzle_id = f.puzzle_id);
  update public.puzzle_favorites set player_id = _uid where player_id = _guest;
  get diagnostics _favs = row_count;

  perform public.recompute_player_stats(_uid);

  if _conflicts is not null then
    foreach _pid in array _conflicts loop
      perform public.rebuild_puzzle_stats_for(_pid);
    end loop;
  end if;

  -- The guest has nothing left. GoTrue's cascades remove its sessions and
  -- refresh tokens; players cascades from auth.users; player_stats from players.
  delete from public.player_stats where player_id = _guest;
  delete from public.players where id = _guest;
  delete from auth.users where id = _guest;

  return query select 'imported'::text, _moved, _dropped, _favs;
end;
$$;

create or replace function public.delete_local_account(_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  _puzzles text[];
  _pid text;
begin
  if _user_id is null then
    return;
  end if;
  -- Lock the parent before any records/handoffs/aggregate rows. Completion,
  -- reconciliation and import follow this same parent-first order.
  perform 1 from public.players where id = _user_id for update;
  perform set_config('wtf.defer_stats', 'on', true);
  select array_agg(distinct puzzle_id order by puzzle_id) into _puzzles
    from public.game_records where player_id = _user_id and completed;

  -- Personal rows only. Every FK here points from the player's rows to content
  -- with ON DELETE RESTRICT/CASCADE in the content→player direction never the
  -- reverse, so nothing in `games` can be reached.
  delete from public.puzzle_favorites where player_id = _user_id;   -- counts trigger decrements
  delete from public.game_records     where player_id = _user_id;
  delete from public.player_stats     where player_id = _user_id;
  delete from public.guest_handoffs   where guest_player_id = _user_id;
  delete from public.admins           where user_id = _user_id;
  delete from public.accounts         where user_id = _user_id;
  delete from public.players          where id = _user_id;
  -- GoTrue's own cascades remove identities, sessions and refresh tokens.
  delete from auth.users where id = _user_id;

  if _puzzles is not null then
    foreach _pid in array _puzzles loop
      perform public.rebuild_puzzle_stats_for(_pid);
    end loop;
  end if;
end;
$$;
