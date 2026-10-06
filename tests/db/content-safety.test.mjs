// CONTENT SAFETY: Deb's puzzles can never be a casualty of account work.
// Against the local stack (npm run db:start / db:reset), proving the
// structural guarantees that make the hosted migration additive:
//   * the account migrations create no FK from content to anything new, and
//     nothing new cascades INTO games;
//   * deleting players, accounts or handoffs cannot remove or alter a games row;
//   * the account functions never touch games (no games statement in their bodies);
//   * a puzzle with plays still cannot be deleted (the live RESTRICT rule survives);
//   * the content fingerprint is stable across the whole account lifecycle.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { contentFingerprint, count, grantAdmin, makeAccount, makeGuest, playPuzzle, puzzleIds, rpc, sql } from "./helpers.mjs";

let before_;
before(() => {
  before_ = { games: count("public.games"), questions: Number(sql("select coalesce(sum(jsonb_array_length(questions)),0) from public.games")), fp: contentFingerprint(), ids: sql("select string_agg(id, ',' order by id) from public.games") };
});

test("C1 no foreign key points FROM games to any table, and every FK INTO games comes from a player/community table that cannot cascade back", () => {
  assert.equal(sql("select count(*) from pg_constraint where contype='f' and conrelid='public.games'::regclass"), "0", "games references nothing");
  const into = sql(`select string_agg(conrelid::regclass::text || ':' || conname, ',' order by conrelid::regclass::text, conname) from pg_constraint where contype='f' and confrelid='public.games'::regclass`);
  assert.equal(into, "game_records:game_records_puzzle_id_fkey,puzzle_favorite_counts:puzzle_favorite_counts_puzzle_id_fkey,puzzle_favorites:puzzle_favorites_puzzle_id_fkey,puzzle_stats:puzzle_stats_puzzle_id_fkey", "exactly the live set; nothing new references games");
  for (const t of ["accounts", "admins", "guest_handoffs"]) {
    assert.equal(sql(`select count(*) from pg_constraint where contype='f' and conrelid='public.${t}'::regclass and confrelid='public.games'::regclass`), "0", `${t} does not reference games`);
  }
});

test("C2 the account functions contain no statement against games", () => {
  for (const fn of ["ensure_account", "my_account", "wtf_uid", "account_email", "offer_guest_history", "resolve_guest_handoff", "import_guest_history", "decline_guest_history", "delete_local_account", "delete_my_account", "recompute_player_stats", "is_wtf_admin"]) {
    const def = sql(`select string_agg(pg_get_functiondef(p.oid), E'\\n') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='${fn}'`);
    assert.ok(def, `${fn} exists`);
    assert.doesNotMatch(def, /\b(insert\s+into|update|delete\s+from|truncate|alter\s+table|drop\s+table)\s+public\.games\b/i, `${fn} never writes games`);
  }
});

test("C3 the whole account lifecycle leaves content byte-identical: play, favorite, handoff, import, admin grant, delete", async () => {
  const [pz] = puzzleIds();
  const g = await makeGuest();
  await playPuzzle(g.client, g.id, pz, [true, false, true, true]);
  await rpc(g.client, "set_puzzle_favorite", { target_puzzle_id: pz, favorite: true });
  const offer = await rpc(g.client, "offer_guest_history");
  const a = await makeAccount("content-safe");
  assert.equal((await rpc(a.client, "import_guest_history", { _code: offer.code })).outcome, "imported");
  grantAdmin(a.id);
  assert.equal(await rpc(a.client, "delete_my_account"), true);
  assert.equal(count("public.games"), before_.games);
  assert.equal(Number(sql("select coalesce(sum(jsonb_array_length(questions)),0) from public.games")), before_.questions);
  assert.equal(contentFingerprint(), before_.fp, "every games row identical");
  assert.equal(sql("select string_agg(id, ',' order by id) from public.games"), before_.ids, "no id renumbered");
});

test("C4 a puzzle with plays still cannot be deleted (RESTRICT), even by an admin; retiring is the only path", async () => {
  const [pz] = puzzleIds();
  const a = await makeAccount("admin-del");
  grantAdmin(a.id);
  await playPuzzle(a.client, a.id, pz, [true, true, true, true]);
  const del = await a.client.from("games").delete().eq("id", pz);
  assert.match(del.error?.message ?? "", /game_records_puzzle_id_fkey|foreign key/i);
  assert.equal(count("public.games", `id = '${pz}'`), 1);
  // deleting the account removes its play; the puzzle is untouched either way
  await rpc(a.client, "delete_my_account");
  assert.equal(count("public.games", `id = '${pz}'`), 1);
  assert.equal(contentFingerprint(), before_.fp);
});

test("C5 cascading from the player side never reaches games", () => {
  // a guest with plays and favorites, removed the hard way (auth user deleted): plays/favorites go, games stay
  const n = count("public.games");
  const anyUser = sql("select id from auth.users where is_anonymous limit 1");
  if (anyUser) {
    sql(`delete from auth.users where id = '${anyUser}'`);
  }
  assert.equal(count("public.games"), n);
  assert.equal(contentFingerprint(), before_.fp);
});
