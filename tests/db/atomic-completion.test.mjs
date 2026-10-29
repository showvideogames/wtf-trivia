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

// Hold the parent in a completion transaction, allow a competing mutation to
// reach a real lock wait, then finish. Before the protocol fix the competing
// delete/import can own a record while waiting for this parent: a deadlock.
async function completionAgainst(owner, mutationSql, verify) {
  const { session, blocked } = await import('./transaction-session.mjs');
  const tag = owner.id.replaceAll('-', '').slice(0, 12);
  const completion = await session(`finish_${tag}`);
  const mutation = await session(`mutation_${tag}`);
  let pending;
  try {
    await completion.query(`begin; select set_config('request.jwt.claim.sub','${owner.id}',true);
      select 1 from public.players where id='${owner.id}' for update;`);
    pending = mutation.query(`begin; ${mutationSql}; commit;`).then(() => null, error => error);
    await blocked(`mutation_${tag}`);
    await completion.query(`select public.complete_my_game('${puzzles[0]}','${JSON.stringify(answers)}'::jsonb,2); commit;`);
    const error = await pending;
    if (error) throw error;
    await verify();
  } finally {
    await completion.close();
    await mutation.close();
    if (pending) await pending;
  }
}

test('completion and account deletion use parent-before-record order at a forced lock barrier', async () => {
  const owner = await makeAccount('delete-race');
  await start(owner, puzzles[0]);
  await completionAgainst(owner, `select public.delete_local_account('${owner.id}')`, () => {
    assert.equal(sql(`select count(*) from public.players where id='${owner.id}'`), '0');
    assert.equal(sql(`select count(*) from public.game_records where player_id='${owner.id}'`), '0');
    assert.equal(sql(`select count(*) from auth.users where id='${owner.id}'`), '0');
  });
});

test('completion and consenting guest import serialize and keep the completed guest winner', async () => {
  const guest = await makeGuest();
  const account = await makeAccount('import-race');
  await start(guest, puzzles[0]);
  await start(account, puzzles[0]);
  const offer = await rpc(guest.client, 'offer_guest_history');
  assert.equal(offer.outcome, 'ok');
  await completionAgainst(guest, `select set_config('request.jwt.claim.sub','${account.id}',true);
    select * from public.import_guest_history('${offer.code}')`, () => {
    assert.equal(sql(`select count(*) from public.players where id='${guest.id}'`), '0');
    assert.equal(sql(`select completed from public.game_records where player_id='${account.id}'`), 't');
    assert.equal(stats(account).total_played, 1);
    assert.equal(stats(account).total_correct, 2);
  });
  assert.equal((await rpc(account.client, 'import_guest_history', { _code: offer.code })).outcome, 'invalid');
});

test('completion and import into the same account serialize without losing either puzzle', async () => {
  const guest = await makeGuest();
  const account = await makeAccount('import-account-race');
  await start(guest, puzzles[1]);
  await finish(guest, puzzles[1]);
  await start(account, puzzles[0]);
  const offer = await rpc(guest.client, 'offer_guest_history');
  await completionAgainst(account, `select set_config('request.jwt.claim.sub','${account.id}',true);
    select * from public.import_guest_history('${offer.code}')`, () => {
    assert.equal(stats(account).total_played, 2);
    assert.equal(stats(account).total_correct, 4);
  });
});

test('malformed legacy calendar date aborts completion and preserves prior record and cached stats', async () => {
  const owner = await makeGuest();
  await start(owner, puzzles[0], '2026-02-30');
  sql(`update public.game_records set completed=true,score=2 where player_id='${owner.id}';
       insert into public.player_stats(player_id,total_played,best_combo) values('${owner.id}',1,9)`);
  await start(owner, puzzles[1]);
  const before = stats(owner);
  await assert.rejects(finish(owner, puzzles[1]), { code: '22008' });
  await assert.rejects(rpc(owner.client, 'my_reconciled_player_stats'), { code: '22008' });
  assert.deepEqual(stats(owner), before);
  assert.equal(sql(`select completed from public.game_records where player_id='${owner.id}' and puzzle_id='${puzzles[1]}'`), 'f');
});

test('document baseline compatibility: incomplete history can lower best combo; no history deletes cached stats', async () => {
  const owner = await makeGuest();
  await start(owner, puzzles[0]);
  sql(`update public.game_records set completed=true,score=2,answers='[]' where player_id='${owner.id}';
       insert into public.player_stats(player_id,total_played,best_combo) values('${owner.id}',1,9)`);
  const result = await rpc(owner.client, 'my_reconciled_player_stats');
  assert.equal(result.best_combo, 0, 'baseline recomputation derives combo only from retained answers');
  const empty = await makeGuest();
  sql(`insert into public.player_stats(player_id,total_played,best_combo) values('${empty.id}',2,9)`);
  assert.equal(await rpc(empty.client, 'my_reconciled_player_stats'), null);
  assert.equal(sql(`select count(*) from public.player_stats where player_id='${empty.id}'`), '0');
});

test('two owners completing one puzzle contend at the community lock and both remain counted', async () => {
  const { session, blocked } = await import('./transaction-session.mjs');
  const a = await makeGuest(), b = await makeGuest();
  await start(a, puzzles[0]);
  await start(b, puzzles[0]);
  const before = Number(sql(`select total_finished from public.puzzle_stats where puzzle_id='${puzzles[0]}'`));
  const gate = await session('community_gate');
  const first = await session('community_first');
  const second = await session('community_second');
  let tasks = [];
  try {
    await gate.query(`begin; select pg_advisory_xact_lock(hashtext('puzzle_stats:' || '${puzzles[0]}'));`);
    tasks = [[first,a], [second,b]].map(([conn, owner]) => conn.query(`begin;
      select set_config('request.jwt.claim.sub','${owner.id}',true);
      select public.complete_my_game('${puzzles[0]}','${JSON.stringify(answers)}'::jsonb,2); commit;`).then(() => null, error => error));
    await blocked('community_first');
    await blocked('community_second');
    await gate.query('commit;');
    for (const error of await Promise.all(tasks)) if (error) throw error;
    assert.equal(stats(a).total_played, 1);
    assert.equal(stats(b).total_played, 1);
    assert.equal(Number(sql(`select total_finished from public.puzzle_stats where puzzle_id='${puzzles[0]}'`)), before + 2);
  } finally {
    await gate.close(); await first.close(); await second.close();
    await Promise.all(tasks);
  }
});

test('explicit mixed-client limit: delayed direct writes can overwrite the RPC winner and aggregate', async () => {
  const owner = await makeGuest();
  await start(owner, puzzles[0]);
  // An old browser has captured this finish and aggregate before the RPC.
  const staleRecord = { completed: true, score: 0, answers: [] };
  const staleStats = { player_id: owner.id, total_played: 99, total_correct: 99, best_combo: 9 };
  const winner = await finish(owner, puzzles[0]);
  assert.equal(winner.record.score, 2);
  assert.equal(winner.stats.total_played, 1);
  const overwrite = await owner.client.from('game_records').update(staleRecord).eq('player_id',owner.id).eq('puzzle_id',puzzles[0]);
  assert.ifError(overwrite.error);
  const cached = await owner.client.from('player_stats').upsert(staleStats);
  assert.ifError(cached.error);
  assert.equal(stats(owner).total_played, 99);
  const retry = await finish(owner, puzzles[0]);
  assert.equal(retry.record.score, 0, 'first-win guarantee cannot survive an unrestricted old writer');
  assert.equal(retry.stats.total_correct, 0, 'reconciliation follows the overwritten durable record');
});

test('negative control: baseline deletion and import reproduce deadlocks under the same barriers', async () => {
  const { readFileSync } = await import('node:fs');
  const baseline = readFileSync(new URL('../../supabase/migrations/0001_wtf_baseline.sql', import.meta.url), 'utf8');
  for (const name of ['delete_local_account', 'import_guest_history']) {
    const signature = name === 'delete_local_account' ? 'uuid' : 'text';
    const saved = sql(`select pg_get_functiondef('public.${name}(${signature})'::regprocedure)`);
    const startAt = baseline.indexOf(`create function public.${name}(`);
    const original = baseline.slice(startAt, baseline.indexOf('\n$$;',startAt)+4).replace('create function', 'create or replace function');
    const owner = name === 'delete_local_account' ? await makeAccount('negative-delete') : await makeGuest();
    await start(owner,puzzles[0]);
    let mutation = `select public.delete_local_account('${owner.id}')`;
    if (name === 'import_guest_history') {
      const account = await makeAccount('negative-import');
      await start(account,puzzles[0]);
      const offer = await rpc(owner.client,'offer_guest_history');
      mutation = `select set_config('request.jwt.claim.sub','${account.id}',true); select * from public.import_guest_history('${offer.code}')`;
    }
    try {
      sql(original);
      await assert.rejects(completionAgainst(owner, mutation, () => {}), /deadlock detected/);
    } finally {
      sql(saved);
    }
  }
});

test('account refresh waits before the account row while deletion holds the player', async () => {
  const { session, blocked } = await import('./transaction-session.mjs');
  const owner = await makeAccount('refresh-delete');
  const deletion = await session('refresh_delete_owner');
  const refresh = await session('refresh_delete_waiter');
  let pending;
  try {
    await deletion.query(`begin; select 1 from public.players where id='${owner.id}' for update;`);
    pending = refresh.query(`begin; select set_config('request.jwt.claim.sub','${owner.id}',true);
      select * from public.ensure_account(); commit;`).then(() => null, error => error);
    await blocked('refresh_delete_waiter');
    await deletion.query(`select public.delete_local_account('${owner.id}'); commit;`);
    // A refresh authenticated before deletion may fail its FK after deletion;
    // it must never resurrect the owner or deadlock with deletion.
    const result = await pending;
    if (result) assert.doesNotMatch(result.message, /deadlock detected/);
    assert.equal(sql(`select count(*) from public.players where id='${owner.id}'`), '0');
    assert.equal(sql(`select count(*) from public.accounts where user_id='${owner.id}'`), '0');
  } finally {
    await deletion.close(); await refresh.close();
    if (pending) await pending;
  }
});

test('revoking consent while import waits invalidates the code without moving guest history', async () => {
  const { session, blocked } = await import('./transaction-session.mjs');
  const guest = await makeGuest();
  const account = await makeAccount('revoke-waiting-import');
  await start(guest, puzzles[0]);
  const offer = await rpc(guest.client, 'offer_guest_history');
  assert.equal(offer.outcome, 'ok');
  const gate = await session('consent_gate');
  const importer = await session('consent_importer');
  let pending;
  try {
    await gate.query(`begin; select 1 from public.players where id='${guest.id}' for update;`);
    pending = importer.query(`begin; select set_config('request.jwt.claim.sub','${account.id}',true);
      select * from public.import_guest_history('${offer.code}'); commit;`).then(value => ({value}), error => ({error}));
    await blocked('consent_importer');
    assert.equal((await rpc(account.client, 'decline_guest_history', { _code: offer.code })).outcome, 'started_fresh');
    await gate.query('commit;');
    const result = await pending;
    if (result.error) throw result.error;
    assert.match(result.value, /invalid\|0\|0\|0/);
    assert.equal(sql(`select count(*) from public.game_records where player_id='${guest.id}'`), '1');
    assert.equal(sql(`select count(*) from public.game_records where player_id='${account.id}'`), '0');
    assert.equal(sql(`select count(*) from auth.users where id='${guest.id}'`), '1');
  } finally {
    await gate.close(); await importer.close();
    if (pending) await pending;
  }
});
