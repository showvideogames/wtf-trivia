// The account layer, end to end through the real API with real JWTs, against
// the local Supabase stack. Run: npm run test:db (after npm run db:start / db:reset)
//
// Covers: the baseline builds and content is declared as live; a guest
// (anonymous user) is a guest everywhere and keeps today's game exactly; a
// non-platform auth user is not an account; ensure_account creates/links
// from the identity row only; global_user_id is unique; email is
// identity-first metadata; the guest handoff (offer → resolve → import /
// decline) moves rows in place, merges conflicts, recomputes counters, is
// single-use and fails closed; deletion removes everything personal and a
// re-sign-in gets a clean account with the same global id; the admin gate;
// content is untouched by all of it.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  admin, anon, attachPlatformIdentity, contentFingerprint, count, createAuthUser, grantAdmin, makeAccount, makeGuest,
  playPuzzle, puzzleIds, rpc, rpcError, setPlatformIdentityEmail, signIn, sql, uniqueEmail, uniqueGlobalId,
} from "./helpers.mjs";

let puzzles;
let contentBefore;

before(() => {
  puzzles = puzzleIds();
  assert.ok(puzzles.length >= 3, "the seed gives the local stack at least three published puzzles");
  contentBefore = { games: count("public.games"), fingerprint: contentFingerprint() };
});

// ── Baseline ─────────────────────────────────────────────────

test("T1 baseline: live tables declared, account tables start empty, ledger holds 0001-0004, RLS on everywhere", () => {
  assert.equal(sql("select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations"), "0001,0002,0003,0004");
  for (const t of ["games", "players", "game_records", "player_stats", "puzzle_stats", "puzzle_favorites", "puzzle_favorite_counts", "accounts", "admins", "guest_handoffs"]) {
    assert.equal(sql(`select to_regclass('public.${t}') is not null`), "t", `${t} exists`);
    assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.${t}'::regclass`), "t", `RLS on ${t}`);
  }
  // the live shape that matters most: ids are text, plays key on puzzle_id, questions live in the row
  assert.equal(sql("select udt_name from information_schema.columns where table_schema='public' and table_name='games' and column_name='id'"), "text");
  assert.equal(sql("select udt_name from information_schema.columns where table_schema='public' and table_name='games' and column_name='questions'"), "jsonb");
  assert.equal(sql("select pg_get_constraintdef(oid) from pg_constraint where conname='game_records_puzzle_id_fkey'"), "FOREIGN KEY (puzzle_id) REFERENCES games(id) ON DELETE RESTRICT");
  // the live triggers are in place
  for (const tg of ["game_records_assign_puzzle", "game_records_completed_stats", "puzzle_favorites_count", "games_set_updated_at"]) {
    assert.equal(sql(`select count(*) from pg_trigger where tgname='${tg}' and not tgisinternal`), "1", `trigger ${tg}`);
  }
});

test("T1b grants: anon/authenticated hold exactly the intended privileges on the new tables; no client reaches accounts/admins/handoffs", () => {
  const privs = (role, table) =>
    sql(`select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
          where grantee = '${role}' and table_schema = 'public' and table_name = '${table}'`);
  for (const t of ["accounts", "admins", "guest_handoffs"]) {
    assert.equal(privs("anon", t), "", `anon has nothing on ${t}`);
    assert.equal(privs("authenticated", t), "", `authenticated has nothing on ${t}`);
  }
  // after 0003: content is read-only for anon; authenticated may write (RLS: admins only)
  assert.equal(privs("anon", "games"), "SELECT");
  assert.equal(privs("authenticated", "games"), "DELETE,INSERT,SELECT,UPDATE");
  // after 0002: player tables are own-rows via authenticated; anon has nothing
  assert.equal(privs("anon", "game_records"), "");
  assert.equal(privs("authenticated", "game_records"), "INSERT,SELECT,UPDATE");
  assert.equal(privs("anon", "players"), "");
  // internals are service_role only
  for (const fn of ["account_email(uuid)", "delete_local_account(uuid)", "recompute_player_stats(uuid)", "guest_history_summary(uuid)", "best_combo(jsonb)"]) {
    assert.equal(sql(`select has_function_privilege('authenticated', 'public.${fn}', 'execute')`), "f", `${fn} not callable by authenticated`);
    assert.equal(sql(`select has_function_privilege('anon', 'public.${fn}', 'execute')`), "f", `${fn} not callable by anon`);
  }
});

// ── Guests: today's game, unchanged ─────────────────────────

test("T2 a guest (anonymous user) plays exactly as today: own player row, own plays, own stats, favorites; a guest is not an account", async () => {
  const g = await makeGuest();
  assert.equal(await rpc(g.client, "wtf_uid"), null, "a guest has no account id");
  assert.equal((await rpc(g.client, "ensure_account")).outcome, "not_platform_linked");
  assert.equal(count("public.accounts", `user_id = '${g.id}'`), 0);

  const rec = await playPuzzle(g.client, g.id, puzzles[0], [true, true, false, true]);
  assert.equal(rec.completed, true);
  assert.equal(rec.score, 3);
  assert.equal(rec.game_date, sql(`select date from public.games where id='${puzzles[0]}'`));
  const stats = await g.client.from("puzzle_stats").select("*").eq("puzzle_id", puzzles[0]);
  assert.ok(stats.data[0].total_finished >= 1, "community stats count the guest's finish");
  const fav = await rpc(g.client, "set_puzzle_favorite", { target_puzzle_id: puzzles[1], favorite: true });
  assert.ok(fav >= 1);

  // another guest sees none of it
  const h = await makeGuest();
  const peek = await h.client.from("game_records").select("*").eq("player_id", g.id);
  assert.deepEqual(peek.data, []);
  const peekPlayer = await h.client.from("players").select("*").eq("id", g.id);
  assert.deepEqual(peekPlayer.data, [], "0002: a player row is not readable by others");
  // and anon (no session) sees no player data at all but reads content and community stats
  const a = anon();
  assert.match((await a.from("game_records").select("*")).error.message, /permission denied/i);
  assert.equal((await a.from("games").select("id").limit(1)).error, null);
  assert.equal((await a.from("puzzle_stats").select("puzzle_id").limit(1)).error, null);
  assert.equal(await rpc(a, "ping"), true);
});

test("T2b anon cannot call the account RPCs (grants)", async () => {
  const a = anon();
  for (const fn of ["ensure_account", "my_account", "delete_my_account", "offer_guest_history"]) {
    const err = await rpcError(a, fn);
    assert.match(err.message, /permission denied|not found|does not exist/i, `${fn} refused for anon: ${err.message}`);
  }
});

// ── Account boundary ─────────────────────────────────────────

test("T3 a password auth user without the shared sign-in is not an account: not_platform_linked, guest everywhere", async () => {
  const user = await createAuthUser(uniqueEmail("stray"));
  const client = await signIn(user);
  const row = await rpc(client, "ensure_account");
  assert.equal(row.outcome, "not_platform_linked");
  assert.equal(count("public.accounts", `user_id = '${user.id}'`), 0, "no accounts row was created");
  assert.equal(await rpc(client, "wtf_uid"), null);
  assert.equal((await rpc(client, "import_guest_history", { _code: "x".repeat(32) })).outcome, "not_signed_in");
  assert.equal((await rpc(client, "offer_guest_history")).outcome, "not_a_guest", "a non-anonymous user cannot hand off either");
  assert.equal(await rpc(client, "delete_my_account"), false);
  assert.equal(await rpc(client, "my_account"), undefined, "my_account returns no row");
});

test("T4 ensure_account creates the account from the custom:platform identity; repeat returns the SAME local account; the player row becomes a non-guest", async () => {
  const gid = uniqueGlobalId();
  const user = await createAuthUser(uniqueEmail("deb"));
  attachPlatformIdentity(user.id, gid, user.email);
  const client = await signIn(user);

  const first = await rpc(client, "ensure_account");
  assert.equal(first.outcome, "ok");
  assert.equal(first.user_id, user.id, "the local id is the project's auth user id");
  assert.equal(first.global_user_id, gid, "the global id is copied from the identity row");
  assert.equal(first.email, user.email);
  assert.match(first.global_user_id, /^user_[0-9A-Za-z]{10,64}$/);
  assert.equal(sql(`select is_guest::text || '|' || coalesce(email,'') from public.players where id = '${user.id}'`), `false|${user.email}`, "players row created as a non-guest with the identity email");

  const seenBefore = sql(`select last_seen_at from public.accounts where user_id = '${user.id}'`);
  await new Promise((r) => setTimeout(r, 20));
  const second = await rpc(client, "ensure_account");
  assert.equal(second.outcome, "ok");
  assert.equal(second.user_id, first.user_id, "same local account");
  assert.equal(second.global_user_id, first.global_user_id);
  assert.equal(count("public.accounts", `user_id = '${user.id}'`), 1, "still exactly one row");
  assert.equal(count("public.players", `id = '${user.id}'`), 1, "still exactly one player row");
  assert.notEqual(sql(`select last_seen_at from public.accounts where user_id = '${user.id}'`), seenBefore, "last_seen_at bumped");

  const mine = await rpc(client, "my_account");
  assert.equal(mine.global_user_id, gid);
  assert.equal(await rpc(client, "wtf_uid"), user.id);
});

test("T4b user_metadata cannot influence the link", async () => {
  const gid = uniqueGlobalId();
  const user = await createAuthUser(uniqueEmail("meta"));
  await admin().auth.admin.updateUserById(user.id, { user_metadata: { sub: "user_FAKEFAKEFAKEFAKEFAKE", global_user_id: "user_FAKEFAKEFAKEFAKEFAKE" } });
  attachPlatformIdentity(user.id, gid, user.email);
  const row = await rpc(await signIn(user), "ensure_account");
  assert.equal(row.global_user_id, gid);
});

test("T5 global_user_id is unique and format-checked: a second auth user cannot claim the same global id", async () => {
  const gid = uniqueGlobalId();
  const a = await makeAccount("first", gid);
  const other = await createAuthUser(uniqueEmail("second"));
  assert.throws(() => sql(`insert into public.accounts (user_id, global_user_id) values ('${other.id}', '${gid}')`), /accounts_global_user_id_key/);
  assert.throws(() => attachPlatformIdentity(other.id, gid, other.email), /identities_provider_id_provider_unique|duplicate key/);
  assert.equal(count("public.accounts", `global_user_id = '${gid}'`), 1);
  assert.equal(sql(`select user_id from public.accounts where global_user_id = '${gid}'`), a.id);
  assert.throws(() => sql(`insert into public.accounts (user_id, global_user_id) values ('${other.id}', 'not-a-workos-id')`), /accounts_global_user_id_format/);
});

// ── Email is metadata ────────────────────────────────────────

test("T6 current email comes from the identity (changes at the provider show through); auth.users.email stays stale; global id unchanged; players.email follows", async () => {
  const p = await makeAccount("mail");
  const changed = uniqueEmail("renamed");
  setPlatformIdentityEmail(p.id, changed);
  const row = await rpc(p.client, "ensure_account");
  assert.equal(row.email, changed, "ensure_account reports the identity's new email");
  assert.equal((await rpc(p.client, "my_account")).email, changed);
  assert.equal(sql(`select email from auth.users where id = '${p.id}'`), p.email, "auth.users.email is not the source");
  assert.equal(sql(`select email from public.players where id = '${p.id}'`), changed, "the display copy on players follows");
  assert.equal(row.global_user_id, p.globalId);
  assert.equal(row.user_id, p.id);
});

// ── Signed-in play ───────────────────────────────────────────

test("T7 an account plays through the same tables as a guest, owns only its rows; another account sees none of them", async () => {
  const a = await makeAccount("alice");
  const b = await makeAccount("bob");
  await playPuzzle(a.client, a.id, puzzles[0], [true, false, true, true]);
  await playPuzzle(b.client, b.id, puzzles[1], [false, false, true, true]);
  const mineA = (await a.client.from("game_records").select("*")).data;
  assert.deepEqual(mineA.map((r) => r.player_id), [a.id]);
  const peek = await b.client.from("game_records").select("*").eq("player_id", a.id);
  assert.deepEqual(peek.data, [], "RLS hides the other account's rows");
  const forged = await b.client.from("game_records").insert({ player_id: a.id, puzzle_id: puzzles[2], game_date: "2026-01-01" });
  assert.match(forged.error.message, /row-level security/i, "cannot write rows for another player");
  const del = await b.client.from("game_records").delete().eq("player_id", b.id);
  assert.match(del.error.message, /permission denied/i, "no client delete on plays (0002)");
});

// ── The guest handoff ────────────────────────────────────────

test("T8 handoff: a guest with history offers a code; the account resolves it, imports it; rows move IN PLACE; counters are recomputed; the guest is gone; the code is spent", async () => {
  const g = await makeGuest();
  const r1 = await playPuzzle(g.client, g.id, puzzles[2], [true, true, true, false]);           // older puzzle, 3/4
  const r2 = await playPuzzle(g.client, g.id, puzzles[1], [true, false, false, false]);         // 1/4
  const r3 = await playPuzzle(g.client, g.id, puzzles[0], [true, true, true, true], { finish: false }); // today's, in progress
  await rpc(g.client, "set_puzzle_favorite", { target_puzzle_id: puzzles[2], favorite: true });
  // the app's incremental counters, as it would have written them
  sql(`insert into public.player_stats (player_id, current_streak, longest_streak, last_played_date, total_played, total_correct, total_questions, best_combo)
       values ('${g.id}', 2, 2, '${r2.game_date}', 2, 4, 8, 3)`);
  const statsBefore = Number(sql(`select total_finished from public.puzzle_stats where puzzle_id='${puzzles[2]}'`));

  const offer = await rpc(g.client, "offer_guest_history");
  assert.equal(offer.outcome, "ok");
  assert.ok(offer.code.length >= 24);
  assert.equal(offer.plays, 3);
  assert.equal(offer.finished, 2);
  assert.equal(offer.current_streak, 2);
  assert.equal(offer.favorites, 1);
  assert.equal(count("public.guest_handoffs", `guest_player_id = '${g.id}'`), 1, "only the hash is stored");
  assert.equal(count("public.guest_handoffs", `code_hash = '${offer.code}'`), 0, "...never the code");

  // a second offer replaces the first (one live code per guest)
  const offer2 = await rpc(g.client, "offer_guest_history");
  assert.equal(count("public.guest_handoffs", `guest_player_id = '${g.id}'`), 1);
  assert.notEqual(offer2.code, offer.code);

  // the account comes back and resolves the pending code
  const acct = await makeAccount("returning");
  const resolved = await rpc(acct.client, "resolve_guest_handoff", { _code: offer2.code });
  assert.equal(resolved.outcome, "ok");
  assert.equal(resolved.finished, 2);
  assert.equal(resolved.account_has_history, false);
  assert.equal((await rpc(acct.client, "resolve_guest_handoff", { _code: offer.code })).outcome, "invalid", "the replaced code is dead");

  const imported = await rpc(acct.client, "import_guest_history", { _code: offer2.code });
  assert.equal(imported.outcome, "imported");
  assert.equal(imported.plays_moved, 3);
  assert.equal(imported.plays_dropped, 0);
  assert.equal(imported.favorites_moved, 1);

  // same rows, same ids, new owner
  const rows = (await acct.client.from("game_records").select("*").order("id")).data;
  assert.deepEqual(rows.map((r) => r.id).sort(), [r1.id, r2.id, r3.id].sort(), "the very same play rows (same ids)");
  assert.ok(rows.every((r) => r.player_id === acct.id));
  assert.equal(count("public.puzzle_favorites", `player_id = '${acct.id}' and puzzle_id = '${puzzles[2]}'`), 1);
  // counters recomputed from the plays, not copied: 2 finished, 4/8 correct, best combo 3, streak over 2 consecutive dates
  const st = (await acct.client.from("player_stats").select("*").eq("player_id", acct.id)).data[0];
  assert.equal(st.total_played, 2);
  assert.equal(st.total_correct, 4);
  assert.equal(st.total_questions, 8);
  assert.equal(st.best_combo, 3);
  assert.equal(st.current_streak, 2);
  assert.equal(st.longest_streak, 2);
  assert.equal(st.last_played_date, r2.game_date);
  // community stats unchanged by a plain move (the same finishes, counted once)
  assert.equal(Number(sql(`select total_finished from public.puzzle_stats where puzzle_id='${puzzles[2]}'`)), statsBefore);
  // the guest is gone
  assert.equal(count("public.players", `id = '${g.id}'`), 0);
  assert.equal(count("auth.users", `id = '${g.id}'`), 0);
  assert.equal(count("public.player_stats", `player_id = '${g.id}'`), 0);
  assert.equal(count("public.guest_handoffs", `guest_player_id = '${g.id}'`), 0);
  // the code is spent
  assert.equal((await rpc(acct.client, "import_guest_history", { _code: offer2.code })).outcome, "invalid");
  assert.equal((await rpc(acct.client, "resolve_guest_handoff", { _code: offer2.code })).outcome, "invalid");
});

test("T8b handoff merge: a puzzle played by both keeps the better play, drops the other, counts once in community stats; favorites unite", async () => {
  const acct = await makeAccount("merger");
  const accPlay = await playPuzzle(acct.client, acct.id, puzzles[1], [true, false, false, false]);        // account: 1/4
  await playPuzzle(acct.client, acct.id, puzzles[2], [true, true, true, true]);                         // account: 4/4 (guest will have an unfinished one)
  await rpc(acct.client, "set_puzzle_favorite", { target_puzzle_id: puzzles[0], favorite: true });
  const g = await makeGuest();
  const guestBetter = await playPuzzle(g.client, g.id, puzzles[1], [true, true, true, false]);          // guest: 3/4 → wins
  const guestWorse = await playPuzzle(g.client, g.id, puzzles[2], [true, true, true, true], { finish: false }); // unfinished → loses
  const guestOnly = await playPuzzle(g.client, g.id, puzzles[0], [false, false, true, true]);            // only the guest played it
  await rpc(g.client, "set_puzzle_favorite", { target_puzzle_id: puzzles[0], favorite: true });        // both favorited puzzles[0]
  const favCountBefore = Number(sql(`select favorite_count from public.puzzle_favorite_counts where puzzle_id='${puzzles[0]}'`));
  const finishedBefore1 = Number(sql(`select total_finished from public.puzzle_stats where puzzle_id='${puzzles[1]}'`));

  const offer = await rpc(g.client, "offer_guest_history");
  const resolved = await rpc(acct.client, "resolve_guest_handoff", { _code: offer.code });
  assert.equal(resolved.account_has_history, true);
  const imported = await rpc(acct.client, "import_guest_history", { _code: offer.code });
  assert.equal(imported.outcome, "imported");
  assert.equal(imported.plays_dropped, 2, "one account row (worse) and one guest row (unfinished) dropped");
  assert.equal(imported.plays_moved, 2, "the guest's better play and its guest-only play moved");

  const rows = Object.fromEntries((await acct.client.from("game_records").select("*")).data.map((r) => [r.puzzle_id, r]));
  assert.equal(rows[puzzles[1]].id, guestBetter.id, "the guest's better play replaced the account's");
  assert.equal(rows[puzzles[1]].score, 3);
  assert.notEqual(rows[puzzles[2]].id, guestWorse.id, "the account's finished play survived the guest's unfinished one");
  assert.equal(rows[puzzles[2]].score, 4);
  assert.equal(rows[puzzles[0]].id, guestOnly.id);
  assert.equal(count("public.game_records", `id = ${accPlay.id}`), 0, "the dropped row is gone");
  assert.equal(count("public.game_records", `id = ${guestWorse.id}`), 0);
  // one person, one finish per puzzle in community stats
  assert.equal(Number(sql(`select total_finished from public.puzzle_stats where puzzle_id='${puzzles[1]}'`)), finishedBefore1 - 1);
  // the shared favorite counts once
  assert.equal(Number(sql(`select favorite_count from public.puzzle_favorite_counts where puzzle_id='${puzzles[0]}'`)), favCountBefore - 1);
  assert.equal(count("public.puzzle_favorites", `player_id = '${acct.id}'`), 1);
  // counters from the merged plays: 3 finished (3 + 4 + 2 = 9 of 12)
  const st = (await acct.client.from("player_stats").select("*").eq("player_id", acct.id)).data[0];
  assert.equal(st.total_played, 3);
  assert.equal(st.total_correct, 9);
  assert.equal(st.total_questions, 12);
  assert.equal(st.current_streak, 3, "three consecutive puzzle dates");
});

test("T8c handoff fails closed: wrong code, expired code, decline, a guest without history, an account cannot offer", async () => {
  const acct = await makeAccount("careful");
  assert.equal((await rpc(acct.client, "resolve_guest_handoff", { _code: "nope" })).outcome, "invalid");
  assert.equal((await rpc(acct.client, "import_guest_history", { _code: "A".repeat(32) })).outcome, "invalid");
  assert.equal((await rpc(acct.client, "decline_guest_history", { _code: "A".repeat(32) })).outcome, "invalid");
  assert.equal((await rpc(acct.client, "offer_guest_history")).outcome, "not_a_guest");

  const empty = await makeGuest();
  assert.equal((await rpc(empty.client, "offer_guest_history")).outcome, "no_history");

  // decline: nothing moves, the code is spent, the guest rows stay where they are
  const g = await makeGuest();
  await playPuzzle(g.client, g.id, puzzles[0], [true, true, false, false]);
  const offer = await rpc(g.client, "offer_guest_history");
  assert.equal((await rpc(acct.client, "decline_guest_history", { _code: offer.code })).outcome, "started_fresh");
  assert.equal(count("public.game_records", `player_id = '${g.id}'`), 1, "the guest's play stays on the guest");
  assert.equal(count("public.game_records", `player_id = '${acct.id}'`), 0);
  assert.equal((await rpc(acct.client, "import_guest_history", { _code: offer.code })).outcome, "invalid", "declined = spent");

  // expired: the clock ran out
  const g2 = await makeGuest();
  await playPuzzle(g2.client, g2.id, puzzles[1], [true, true, false, false]);
  const offer2 = await rpc(g2.client, "offer_guest_history");
  sql(`update public.guest_handoffs set expires_at = now() - interval '1 minute' where guest_player_id = '${g2.id}'`);
  assert.equal((await rpc(acct.client, "resolve_guest_handoff", { _code: offer2.code })).outcome, "expired");
  assert.equal((await rpc(acct.client, "import_guest_history", { _code: offer2.code })).outcome, "expired");
  assert.equal(count("public.game_records", `player_id = '${g2.id}'`), 1);

  // a guest cannot import (only accounts can claim)
  const g3 = await makeGuest();
  await playPuzzle(g3.client, g3.id, puzzles[2], [true, true, false, false]);
  const offer3 = await rpc(g3.client, "offer_guest_history");
  assert.equal((await rpc(g3.client, "import_guest_history", { _code: offer3.code })).outcome, "not_signed_in");
  assert.equal((await rpc(g3.client, "resolve_guest_handoff", { _code: offer3.code })).outcome, "not_signed_in");
});

// ── Deletion ─────────────────────────────────────────────────

test("T9 delete_my_account removes plays, stats, favorites, the account and the auth user; community stats drop its finishes; signing in again gets a clean account with the SAME global id", async () => {
  const gid = uniqueGlobalId();
  const p = await makeAccount("leaver", gid);
  await playPuzzle(p.client, p.id, puzzles[0], [true, true, true, true]);
  await rpc(p.client, "set_puzzle_favorite", { target_puzzle_id: puzzles[0], favorite: true });
  grantAdmin(p.id);
  const finishedBefore = Number(sql(`select total_finished from public.puzzle_stats where puzzle_id='${puzzles[0]}'`));
  const favBefore = Number(sql(`select favorite_count from public.puzzle_favorite_counts where puzzle_id='${puzzles[0]}'`));

  assert.equal(await rpc(p.client, "delete_my_account"), true);
  for (const [t, col] of [["public.game_records", "player_id"], ["public.player_stats", "player_id"], ["public.puzzle_favorites", "player_id"], ["public.admins", "user_id"], ["public.accounts", "user_id"], ["public.players", "id"], ["auth.users", "id"], ["auth.identities", "user_id"]]) {
    assert.equal(count(t, `${col} = '${p.id}'`), 0, `${t} cleared`);
  }
  assert.equal(Number(sql(`select coalesce((select total_finished from public.puzzle_stats where puzzle_id='${puzzles[0]}'), 0)`)), finishedBefore - 1, "the deleted player's finish leaves the crowd numbers");
  assert.equal(Number(sql(`select favorite_count from public.puzzle_favorite_counts where puzzle_id='${puzzles[0]}'`)), favBefore - 1);
  const after = await p.client.rpc("ensure_account");
  assert.ok(after.error || after.data?.[0]?.outcome !== "ok", "the dead session can do nothing");

  const again = await makeAccount("leaver-again", gid);
  assert.notEqual(again.id, p.id);
  assert.equal(again.account.global_user_id, gid);
  assert.equal(count("public.game_records", `player_id = '${again.id}'`), 0, "clean slate");
  assert.equal(count("public.accounts", `global_user_id = '${gid}'`), 1);
  assert.equal(count("public.admins", `user_id = '${again.id}'`), 0, "admin rights do not carry over");
});

test("T9b delete_local_account is service-role only; one account cannot delete another", async () => {
  const p = await makeAccount("victim");
  const q = await makeAccount("attacker");
  const err = await rpcError(q.client, "delete_local_account", { _user_id: p.id });
  assert.match(err.message, /permission denied/i);
  assert.equal(count("public.accounts", `user_id = '${p.id}'`), 1);
  assert.equal(count("auth.users", `id = '${p.id}'`), 1);
});

// ── Admin gate (0003) ────────────────────────────────────────

test("T10 content writes: anon refused, a guest refused, a signed-in non-admin refused, an admin allowed; everyone can read every status", async () => {
  const id = `g-test-${Date.now()}`;
  const puzzle = { id, date: "2031-01-01", theme_title: "Admin test", category_a: "A", category_b: "B", status: "draft", questions: [] };
  const a = anon();
  assert.match((await a.from("games").insert(puzzle)).error.message, /permission denied/i);
  const g = await makeGuest();
  assert.match((await g.client.from("games").insert(puzzle)).error.message, /row-level security/i, "RLS, not a grant, refuses the guest");
  const p = await makeAccount("notadmin");
  assert.equal(await rpc(p.client, "is_wtf_admin"), false);
  assert.match((await p.client.from("games").insert(puzzle)).error.message, /row-level security/i);
  const upd = await p.client.from("games").update({ theme_title: "hacked" }).eq("id", puzzles[0]);
  assert.equal(upd.error, null, "an update that matches no writable rows is silently zero rows");
  assert.notEqual(sql(`select theme_title from public.games where id = '${puzzles[0]}'`), "hacked");
  const del = await p.client.from("games").delete().eq("id", puzzles[0]);
  assert.equal(del.error, null);
  assert.equal(count("public.games", `id = '${puzzles[0]}'`), 1, "...and the puzzle is still there");
  // reads: every row of every status, as the app loads today (Studio lists drafts; Home picks today's published one)
  assert.equal((await g.client.from("games").select("id,status")).data.length, count("public.games"));
  assert.equal((await a.from("games").select("id,status")).data.length, count("public.games"));

  grantAdmin(p.id);
  assert.equal(await rpc(p.client, "is_wtf_admin"), true);
  // the exact write shape App.jsx's Studio uses: upsert with merge-duplicates
  const post = await p.client.from("games").upsert(puzzle, { onConflict: "id" }).select();
  assert.equal(post.error, null);
  assert.equal(post.data[0].id, id);
  const upd2 = await p.client.from("games").update({ theme_title: "Admin test 2" }).eq("id", id).select();
  assert.equal(upd2.data[0].theme_title, "Admin test 2");
  const del2 = await p.client.from("games").delete().eq("id", id);
  assert.equal(del2.error, null);
  assert.equal(count("public.games", `id = '${id}'`), 0);
});

test("T10b admins must be accounts (FK) and cannot be read by clients", async () => {
  const stray = await createAuthUser(uniqueEmail("strayadmin"));
  assert.throws(() => grantAdmin(stray.id), /admins_user_id_fkey|violates foreign key/);
  const p = await makeAccount("peeker");
  assert.match((await p.client.from("admins").select("*")).error.message, /permission denied/i);
  assert.match((await p.client.from("accounts").select("*")).error.message, /permission denied/i);
  assert.match((await p.client.from("guest_handoffs").select("*")).error.message, /permission denied/i);
});

// ── Content untouched ────────────────────────────────────────

test("T11 content is unchanged by everything above: same row count, same fingerprint, same ids", () => {
  assert.equal(count("public.games"), contentBefore.games);
  assert.equal(contentFingerprint(), contentBefore.fingerprint);
});
