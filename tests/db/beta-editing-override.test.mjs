// BETA EDITING OVERRIDE (supabase/migrations/0006_beta_editing_override.sql),
// against the local stack (npm run db:start / db:reset):
//   * it ships off, and turning it on needs an end time;
//   * no client can read or change the switch; admins can read its state;
//   * while it is on (and unexpired) a published, played puzzle's questions
//     can be shuffled, added and deleted, and none of its plays is deleted;
//   * turned off, or past its end time, the 0005 protection is back.
// The switch is left off and every row this file adds is removed again.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { anon, grantAdmin, makeAccount, makeGuest, playPuzzle, rpc, rpcError, sql } from "./helpers.mjs";

const ID = "g-betatest-live";
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const QS = ["Espresso", "T. rex", "Latte", "Stegosaurus"].map((itemText, i) => ({ id: `q${i + 1}`, itemText, correctCategory: i % 2 ? "B" : "A" }));
// Published and released. The trigger looks only at plays and the switch;
// the Studio's live/today rule is unit-tested in src/admin.
const row = (questions) => ({ id: ID, date: "2019-05-05", theme_title: "Coffee or Dinosaur", category_a: "Coffee", category_b: "Dinosaur", status: "published", questions });
const storedIds = () => sql(`select string_agg(e->>'id', ',' order by n) from public.games, jsonb_array_elements(questions) with ordinality t(e, n) where id = ${q(ID)}`);
const playCount = () => sql(`select count(*) from public.game_records where puzzle_id = ${q(ID)}`);
const switchOn = (interval = "30 days") => sql(`update public.wtf_flags set enabled = true, expires_at = now() + interval ${q(interval)}, updated_at = now() where name = 'beta_editing'`);
const switchOff = () => sql(`update public.wtf_flags set enabled = false, expires_at = null, updated_at = now() where name = 'beta_editing'`);

after(() => {
  switchOff();
  sql(`delete from public.game_records where puzzle_id = ${q(ID)}`);
  sql(`delete from public.games where id = ${q(ID)}`);
});

let admin;
async function setup() {
  if (admin) return admin;
  const a = await makeAccount("betaadmin");
  grantAdmin(a.id);
  admin = a.client;
  const { error } = await admin.from("games").upsert(row(QS), { onConflict: "id" });
  assert.equal(error, null);
  const guest = await makeGuest();
  await playPuzzle(guest.client, guest.id, ID, [true, false, true, true]);
  return admin;
}
// The Studio's write: an upsert of the whole row.
const save = async (questions) => (await admin.from("games").upsert(row(questions), { onConflict: "id" })).error;

test("B1 ships off; turning it on needs an end time; no client can touch the switch", async () => {
  await setup();
  assert.equal(sql(`select enabled::text || '|' || coalesce(expires_at::text, '') from public.wtf_flags where name = 'beta_editing'`), "false|");
  assert.throws(() => sql(`update public.wtf_flags set enabled = true where name = 'beta_editing'`), /wtf_flags_temporary/);
  assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.wtf_flags'::regclass`), "t");
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select coalesce(string_agg(privilege_type, ','), '') from information_schema.role_table_grants where grantee = '${role}' and table_schema = 'public' and table_name = 'wtf_flags'`), "", `${role} has no grant on wtf_flags`);
  }
  assert.match((await admin.from("wtf_flags").update({ enabled: true, expires_at: "2099-01-01" }).eq("name", "beta_editing")).error?.message ?? "", /permission denied/i);
  assert.equal(sql(`select enabled::text from public.wtf_flags where name = 'beta_editing'`), "false");
});

test("B2 admins (only) can read the switch", async () => {
  await setup();
  assert.deepEqual(await rpc(admin, "wtf_beta_editing"), { enabled: false, expires_at: null });
  switchOn();
  const on = await rpc(admin, "wtf_beta_editing");
  assert.equal(on.enabled, true);
  assert.ok(Date.parse(on.expires_at) > Date.now());
  switchOff();
  const guest = await makeGuest();
  assert.match((await rpcError(guest.client, "wtf_beta_editing")).message, /wtf_admin_only/);
  assert.match((await rpcError(anon(), "wtf_beta_editing")).message, /permission denied/i);
});

test("B3 while on, a published, played puzzle can be shuffled, extended and trimmed; its plays stay", async () => {
  await setup();
  const plays = playCount();
  assert.equal(plays, "1");
  assert.match((await save([QS[1], QS[0], QS[2], QS[3]]))?.message ?? "", /games_questions_locked/, "off: refused");
  switchOn();
  assert.equal(await save([QS[2], QS[0], QS[3], QS[1]]), null, "shuffled");
  assert.equal(storedIds(), "q3,q1,q4,q2");
  assert.equal(await save([QS[2], QS[0], QS[3], QS[1], { id: "q5", itemText: "Mocha" }]), null, "added");
  assert.equal(await save([QS[2], QS[3], { id: "q5", itemText: "Mocha" }]), null, "deleted");
  assert.equal(storedIds(), "q3,q4,q5");
  assert.equal(playCount(), plays, "no play is deleted");
});

test("B4 turned off, or past its end time, the protection is back; wording edits never needed it", async () => {
  await setup();
  switchOff();
  assert.match((await save([QS[0], QS[1], QS[2], QS[3]]))?.message ?? "", /games_questions_locked/, "off: refused");
  switchOn("1 second");
  sql(`select pg_sleep(1.2)`);
  assert.equal((await rpc(admin, "wtf_beta_editing")).enabled, false, "expired reads as off");
  assert.match((await save([QS[0], QS[1], QS[2], QS[3]]))?.message ?? "", /games_questions_locked/, "expired: refused");
  switchOff();
  const current = JSON.parse(sql(`select questions from public.games where id = ${q(ID)}`));
  assert.equal(await save(current.map((x, i) => (i === 0 ? { ...x, itemText: "Ristretto" } : x))), null);
});
