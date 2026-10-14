// PICTURE QUIZ (supabase/migrations/0007_picture_quiz.sql), against the
// local stack (npm run db:start / db:reset):
//   * every existing quiz reads as not a picture quiz;
//   * players (anon) can read the flag; only admins can set it;
//   * a quiz saved exactly as the app saves it (src/gameRow.js) round-trips,
//     its questions' pictures and descriptions included.
// Every row this file adds is removed again.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { anon, grantAdmin, makeAccount, makeGuest, sql } from "./helpers.mjs";
import { gameToRow, rowToGame } from "../../src/gameRow.js";

const ID = "g-picturetest";
const QUESTIONS = [
  { id: "q1", orderIndex: 1, itemText: "Mr. Met", correctCategory: "A", questionImage: "https://example.test/wtf-images/questions/1-abc.webp", questionImageAlt: "Cartoon mascot with a baseball for a head" },
  { id: "q2", orderIndex: 2, itemText: "Elmo", correctCategory: "B", questionImage: "", questionImageAlt: "" },
];
const game = (over = {}) => ({ id: ID, date: "2019-06-06", themeTitle: "Sports Mascot or Kids TV Show Mascot?", categoryA: "Sports Mascot", categoryB: "Kids TV Show Mascot", status: "draft", questions: QUESTIONS, ...over });

after(() => sql(`delete from public.games where id = '${ID}'`));

test("P1 the column exists, is not null, and defaults every quiz to not a picture quiz", () => {
  assert.equal(sql(`select data_type || '|' || is_nullable || '|' || column_default from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'picture_quiz'`), "boolean|NO|false");
  assert.equal(sql(`select count(*) from public.games where picture_quiz is distinct from false`), "0");
});

test("P2 an admin saves a picture quiz the way the Studio does, and players read it back whole", async () => {
  const a = await makeAccount("pictureadmin");
  grantAdmin(a.id);
  const { error } = await a.client.from("games").upsert(gameToRow(game({ pictureQuiz: true })), { onConflict: "id" });
  assert.equal(error, null);
  const { data, error: readError } = await anon().from("games").select("*").eq("id", ID).single();
  assert.equal(readError, null);
  const back = rowToGame(data);
  assert.equal(back.pictureQuiz, true);
  assert.equal(back.pictureQuizColumn, true);
  assert.deepEqual(back.questions, QUESTIONS);

  // Turned off again: false is saved, and the pictures stay with the questions.
  const off = await a.client.from("games").upsert(gameToRow({ ...back, pictureQuiz: false }), { onConflict: "id" });
  assert.equal(off.error, null);
  assert.equal(sql(`select picture_quiz::text || '|' || (questions->0->>'questionImage') from public.games where id = '${ID}'`), `false|${QUESTIONS[0].questionImage}`);
});

test("P3 a quiz saved without the column keeps the default", async () => {
  sql(`delete from public.games where id = '${ID}'`);
  const a = await makeAccount("pictureadmin2");
  grantAdmin(a.id);
  const row = gameToRow(game());
  assert.equal("picture_quiz" in row, false);
  const { error } = await a.client.from("games").insert(row);
  assert.equal(error, null);
  assert.equal(sql(`select picture_quiz from public.games where id = '${ID}'`), "f");
});

test("P4 nobody but an admin can turn it on", async () => {
  const guest = await makeGuest();
  const player = await makeAccount("pictureplayer");
  for (const client of [anon(), guest.client, player.client]) {
    await client.from("games").update({ picture_quiz: true }).eq("id", ID);
  }
  assert.equal(sql(`select picture_quiz from public.games where id = '${ID}'`), "f");
});
