// PLAYED QUESTION LOCK (supabase/migrations/0005_played_question_lock.sql),
// against the local stack (npm run db:start / db:reset):
//   * public.wtf_question_structure_changed agrees with
//     questionStructureChanged in src/admin/questionStatus.js;
//   * public.wtf_puzzle_has_plays answers admins only;
//   * a played puzzle's questions can't be reordered, added or deleted, even
//     after it is moved to a future date, while wording edits still save;
//   * an unplayed draft's questions can be reordered, added and deleted.
// Every row this file adds is removed again.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { anon, grantAdmin, makeAccount, makeGuest, playPuzzle, rpc, rpcError, sql } from "./helpers.mjs";
import { questionStructureChanged } from "../../src/admin/questionStatus.js";

const PREFIX = "g-ordertest-";
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const QS = ["Espresso", "T. rex", "Latte", "Stegosaurus"].map((itemText, i) => ({ id: `q${i + 1}`, itemText, correctCategory: i % 2 ? "B" : "A" }));
const row = (id, over = {}) => ({ id: PREFIX + id, date: "2020-02-02", theme_title: "Coffee or Dinosaur", category_a: "Coffee", category_b: "Dinosaur", status: "published", questions: QS, ...over });
const storedIds = (id) => sql(`select string_agg(e->>'id', ',' order by n) from public.games, jsonb_array_elements(questions) with ordinality t(e, n) where id = ${q(PREFIX + id)}`);

after(() => {
  sql(`delete from public.game_records where puzzle_id like '${PREFIX}%'`);
  sql(`delete from public.games where id like '${PREFIX}%'`);
});

let adminClient;
async function setup() {
  if (adminClient) return adminClient;
  const a = await makeAccount("orderadmin");
  grantAdmin(a.id);
  adminClient = a.client;
  for (const r of [row("played"), row("draft", { status: "draft", date: "2031-03-03" })]) {
    const { error } = await adminClient.from("games").upsert(r, { onConflict: "id" });
    assert.equal(error, null);
  }
  const guest = await makeGuest();
  await playPuzzle(guest.client, guest.id, PREFIX + "played", [true, false, true, true]);
  return adminClient;
}

test("O1 the database tells a structural change from ordinary editing exactly as the app does", () => {
  const noIds = QS.map(({ id, ...rest }) => rest);
  const cases = [
    [QS, [QS[1], QS[0], QS[2], QS[3]]],
    [QS, QS.map((x) => ({ ...x, itemText: x.itemText + "!" }))],
    [QS, [...QS, { id: "q5", itemText: "Mocha" }]],
    [QS, [QS[0], QS[2], QS[3]]],
    [QS, [QS[0], { id: "q9" }, QS[1], QS[2], QS[3]]],
    [QS, [QS[0], QS[2], QS[3], { id: "q9" }]],
    [QS, QS.map((x) => ({ ...x, flavorCopy: "new", imageUrl: "https://x/y.webp" }))],
    [noIds, noIds.map((x, i) => (i === 1 ? { ...x, itemText: "Rex" } : x))],
    [QS, [QS[3], QS[2], QS[1], QS[0]]],
    [noIds, [noIds[1], noIds[0], noIds[2], noIds[3]]],
    [noIds, noIds],
    [[], QS],
  ];
  for (const [before, after] of cases) {
    const db = sql(`select public.wtf_question_structure_changed(${q(JSON.stringify(before))}::jsonb, ${q(JSON.stringify(after))}::jsonb)`);
    assert.equal(db === "t", questionStructureChanged(before, after), JSON.stringify(after.map((x) => x.id ?? x.itemText)));
  }
});

test("O2 only admins can ask whether a puzzle has plays", async () => {
  const admin = await setup();
  assert.equal(await rpc(admin, "wtf_puzzle_has_plays", { target_puzzle_id: PREFIX + "played" }), true);
  assert.equal(await rpc(admin, "wtf_puzzle_has_plays", { target_puzzle_id: PREFIX + "draft" }), false);
  const guest = await makeGuest();
  assert.match((await rpcError(guest.client, "wtf_puzzle_has_plays", { target_puzzle_id: PREFIX + "played" })).message, /wtf_admin_only/);
  assert.match((await rpcError(anon(), "wtf_puzzle_has_plays", { target_puzzle_id: PREFIX + "played" })).message, /permission denied/i);
});

test("O3 a played puzzle moved to a future date still refuses reordered, added or deleted questions; wording edits save", async () => {
  const admin = await setup();
  // Move it to a future day (questions unchanged): allowed.
  let res = await admin.from("games").upsert(row("played", { date: "2032-04-04" }), { onConflict: "id" });
  assert.equal(res.error, null);
  // Reorder, the exact write shape the Studio uses: refused, nothing changes.
  res = await admin.from("games").upsert(row("played", { date: "2032-04-04", questions: [QS[1], QS[0], QS[2], QS[3]] }), { onConflict: "id" });
  assert.match(res.error?.message ?? "", /games_questions_locked/);
  assert.equal(storedIds("played"), "q1,q2,q3,q4");
  // A direct update is refused too.
  res = await admin.from("games").update({ questions: [QS[3], QS[2], QS[1], QS[0]] }).eq("id", PREFIX + "played");
  assert.match(res.error?.message ?? "", /games_questions_locked/);
  // Adding one, deleting one, or both at once (same count): refused.
  for (const questions of [[...QS, { id: "q5", itemText: "Mocha" }], [QS[0], QS[2], QS[3]], [QS[0], QS[2], QS[3], { id: "q5", itemText: "Mocha" }]]) {
    res = await admin.from("games").upsert(row("played", { date: "2032-04-04", questions }), { onConflict: "id" });
    assert.match(res.error?.message ?? "", /games_questions_locked/, questions.map((x) => x.id).join(","));
  }
  assert.equal(storedIds("played"), "q1,q2,q3,q4");
  // Wording, commentary and media edits keep every position: saved.
  res = await admin.from("games").upsert(row("played", { date: "2032-04-04", questions: [{ ...QS[0], itemText: "Ristretto", flavorCopy: "tiny" }, { ...QS[1], imageUrl: "https://x/rex.webp" }, ...QS.slice(2)] }), { onConflict: "id" });
  assert.equal(res.error, null);
  assert.equal(storedIds("played"), "q1,q2,q3,q4");
  assert.equal(sql(`select questions->0->>'itemText' from public.games where id = ${q(PREFIX + "played")}`), "Ristretto");
});

test("O4 an unplayed draft's questions can be reordered, added and deleted", async () => {
  const admin = await setup();
  const save = (questions) => admin.from("games").upsert(row("draft", { status: "draft", date: "2031-03-03", questions }), { onConflict: "id" });
  assert.equal((await save([QS[2], QS[0], QS[3], QS[1]])).error, null);
  assert.equal(storedIds("draft"), "q3,q1,q4,q2");
  assert.equal((await save([QS[2], QS[0], QS[3], QS[1], { id: "q5", itemText: "Mocha" }])).error, null);
  assert.equal((await save([QS[2], QS[3], { id: "q5", itemText: "Mocha" }])).error, null);
  assert.equal(storedIds("draft"), "q3,q4,q5");
});
