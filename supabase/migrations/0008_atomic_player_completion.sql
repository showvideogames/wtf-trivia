-- Additive backend preparation only. Existing clients and table grants are
-- unchanged. See docs/atomic-completion-rollout.md before any hosted rollout.
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
