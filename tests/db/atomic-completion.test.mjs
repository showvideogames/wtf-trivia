// Real PostgreSQL/API tests, isolated local Supabase only; no hosted fixtures.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { anon, makeGuest, makeAccount, puzzleIds, puzzleDate, rpc, rpcError, sql, stack } from './helpers.mjs';

let puzzles;
before(() => {
  stack(); // fail closed before any SQL if configured endpoint is not local
  puzzles = puzzleIds();
  assert.ok(puzzles.length >= 3);
});
const answers = [true, true, false].map((correct, index) => ({ index, choice: 'A', correct }));
async function start(owner, puzzle, date = puzzleDate(puzzle)) {
  const { error } = await owner.client.from('game_records').insert({
    player_id: owner.id, puzzle_id: puzzle, game_date: date,
    total_questions: 3, answers: [], score: 0, completed: false,
  });
  if (error) throw error;
}
function finish(owner, puzzle, extra = {}) {
  return rpc(owner.client, 'complete_my_game', { _puzzle_id: puzzle, _answers: answers, _score: 2, ...extra });
}
function stats(owner) {
  return JSON.parse(sql(`select row_to_json(s) from public.player_stats s where player_id='${owner.id}'`));
}

test('guest retry after lost response preserves first finish and counts exactly once', async () => {
  const owner = await makeGuest();
  await start(owner, puzzles[0]);
  const first = await finish(owner, puzzles[0]);
  const retry = await finish(owner, puzzles[0], { _answers: [], _score: 0 });
  assert.deepEqual(retry.record, first.record);
  assert.equal(retry.stats.total_played, 1);
  assert.equal(retry.stats.total_correct, 2);
  assert.equal(retry.stats.total_questions, 3);
  assert.equal(retry.stats.best_combo, 2);
});

test('simultaneous same-puzzle and different-puzzle calls retain every committed finish', async () => {
  const owner = await makeAccount('atomic');
  await start(owner, puzzles[0], '2026-01-01');
  await start(owner, puzzles[1], '2026-01-02');
  const results = await Promise.all([
    finish(owner, puzzles[0]), finish(owner, puzzles[1]), finish(owner, puzzles[0]),
    rpc(owner.client, 'my_reconciled_player_stats'),
  ]);
  assert.deepEqual(results[0].record, results[2].record);
  const final = stats(owner);
  assert.equal(final.total_played, 2);
  assert.equal(final.total_correct, 4);
  assert.equal(final.total_questions, 6);
  assert.equal(final.current_streak, 2);
  assert.equal(final.last_played_date, '2026-01-02');
});

test('missing own record cannot finish another user record; unauthenticated access denied', async () => {
  const owner = await makeGuest();
  const stranger = await makeGuest();
  await start(owner, puzzles[0]);
  const args = { _puzzle_id: puzzles[0], _answers: answers, _score: 2 };
  assert.equal((await rpcError(stranger.client, 'complete_my_game', args)).code, 'P0002');
  assert.equal(sql(`select completed from public.game_records where player_id='${owner.id}'`), 'f');
  for (const fn of ['complete_my_game(text,jsonb,integer)', 'my_reconciled_player_stats()']) {
    assert.equal(sql(`select has_function_privilege('anon','public.${fn}','execute')`), 'f');
    assert.equal(sql(`select has_function_privilege('authenticated','public.${fn}','execute')`), 't');
  }
  assert.ok(await rpcError(anon(), 'complete_my_game', args));
  assert.ok(await rpcError(anon(), 'my_reconciled_player_stats'));
  assert.equal(await rpc(stranger.client, 'my_reconciled_player_stats'), null);
});

test('invalid new payload cannot partially complete a game', async () => {
  const owner = await makeGuest();
  await start(owner, puzzles[0]);
  for (const extra of [{ _answers: {} }, { _answers: null }, { _answers: [] }, { _score: 4 }, { _score: -1 }, { _score: null }]) {
    await assert.rejects(finish(owner, puzzles[0], extra), { code: '22023' });
  }
  assert.equal(sql(`select completed from public.game_records where player_id='${owner.id}'`), 'f');
});

test('aggregate failure rolls back completion and allows a clean retry', async () => {
  const owner = await makeGuest();
  await start(owner, puzzles[0]);
  const communityBefore = sql(`select coalesce(to_jsonb(s)::text,'') from public.puzzle_stats s where puzzle_id='${puzzles[0]}'`);
  // Only this disposable fixture owner is affected; always remove the trigger.
  sql(`create function public.test_fail_atomic_stats() returns trigger language plpgsql as $$
       begin if new.player_id='${owner.id}'::uuid then raise exception 'fixture stats failure'; end if; return new; end $$;
       create trigger test_fail_atomic_stats before insert or update on public.player_stats
       for each row execute function public.test_fail_atomic_stats()`);
  try {
    await assert.rejects(finish(owner, puzzles[0]), /fixture stats failure/);
    assert.equal(sql(`select completed from public.game_records where player_id='${owner.id}'`), 'f');
    assert.equal(sql(`select count(*) from public.player_stats where player_id='${owner.id}'`), '0');
    assert.equal(sql(`select coalesce(to_jsonb(s)::text,'') from public.puzzle_stats s where puzzle_id='${puzzles[0]}'`), communityBefore);
  } finally {
    sql('drop trigger test_fail_atomic_stats on public.player_stats; drop function public.test_fail_atomic_stats()');
  }
  assert.equal((await finish(owner, puzzles[0])).stats.total_played, 1);
});

test('legacy completed records and streak semantics are preserved; stale totals reconcile', async () => {
  const owner = await makeGuest();
  // Two distinct puzzles on one date, then a gap. Legacy answer shape may be incomplete.
  for (let i = 0; i < 3; i++) {
    await start(owner, puzzles[i], i < 2 ? '2026-01-01' : '2026-01-04');
    sql(`update public.game_records set completed=true, score=1, answers='[]'::jsonb
         where player_id='${owner.id}' and puzzle_id='${puzzles[i]}'`);
  }
  sql(`select public.recompute_player_stats('${owner.id}')`);
  const baseline = stats(owner);
  const legacy = await finish(owner, puzzles[0]);
  assert.equal(legacy.record.score, 1);
  assert.deepEqual(legacy.record.answers, []);
  for (const key of ['total_played','total_correct','total_questions','best_combo','last_played_date','current_streak','longest_streak']) {
    assert.equal(legacy.stats[key], baseline[key], key);
  }
  assert.equal(legacy.stats.total_played, 3);
  assert.equal(legacy.stats.current_streak, 1);
  assert.equal(legacy.stats.longest_streak, 1);
  const { error } = await owner.client.from('player_stats').update({ total_played: 999, total_correct: 999 }).eq('player_id', owner.id);
  assert.ifError(error); // old clients still retain this permission
  const repaired = await rpc(owner.client, 'my_reconciled_player_stats');
  assert.equal(repaired.total_played, 3);
  assert.equal(repaired.total_correct, 3);
});
