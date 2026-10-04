import { describe, expect, it } from "vitest";
import { answerWriteApplies, answerWriteFilter, saveAnswerThenSync, syncedRecord } from "./answerSync.js";

const ans = (n) => Array.from({ length: n }, (_, i) => ({ questionIndex: i, chosenCategory: "A", correct: i % 2 === 0 }));
const rec = (over = {}) => ({
  puzzleId: "p1", score: 1, totalQuestions: 8, currentIndex: 1,
  answers: ans(1), completed: false, ...over,
});

// A tiny stand-in for a React state setter.
function stateOf(initial) {
  let value = initial;
  return { get: () => value, set: (update) => { value = typeof update === "function" ? update(value) : update; } };
}

// One game_records row behind a PostgREST-style PATCH. The filters are the
// ones dbRecordAnswer sends (answerWriteFilter), evaluated the way Postgres
// would: `completed=eq.false`, and `answers->>N=is.null` (no element at
// index N). A request reaches the "database" only when the test delivers
// it, so arrival order is under the test's control; deliver(i, "fail")
// makes that request fail like a network/HTTP error.
function fakeRecordsTable(row) {
  const stored = { ...row };
  const inFlight = [];
  const matches = (filter) => filter.split("&").every((cond) => {
    const [col, op] = cond.split("=");
    if (col === "completed" && op === "eq.false") return stored.completed === false;
    const idx = /^answers->>(\d+)$/.exec(col);
    if (idx && op === "is.null") return stored.answers[Number(idx[1])] === undefined;
    throw new Error(`unmodelled filter: ${cond}`);
  });
  // Mirrors dbRecordAnswer: PATCH, then "landed" = a row came back.
  const save = (answers, score) => () => new Promise((resolve, reject) => {
    inFlight.push((mode) => {
      if (mode === "fail") return reject(new Error("Supabase error 503"));
      if (!matches(answerWriteFilter(answers))) return resolve(false);
      Object.assign(stored, { answers, score });
      resolve(true);
    });
  });
  const deliver = async (i, mode) => { inFlight[i](mode); await Promise.resolve(); await Promise.resolve(); };
  return { stored, save, deliver };
}

// What handleAnswer does for each answer.
const launch = (db, home, n, score) =>
  saveAnswerThenSync({ save: db.save(ans(n), score), setRecord: home.set, puzzleId: "p1", answers: ans(n), score });

describe("answer saves: persistence never moves backward", () => {
  it("a newer save that lands first is not overwritten by an older one landing late", async () => {
    const db = fakeRecordsTable(rec());          // 1 answer saved
    const home = stateOf(rec());
    const older = launch(db, home, 2, 1);        // request 0: answers 1-2
    const newer = launch(db, home, 3, 2);        // request 1: answers 1-3
    await db.deliver(1);                         // newer reaches the database first
    await db.deliver(0);                         // older arrives last
    expect(await newer).toBe(true);
    expect(await older).toBe(false);             // matched no row
    expect(db.stored.answers).toEqual(ans(3));   // the database kept the longer list
    expect(db.stored.score).toBe(2);
    expect(home.get().answers).toEqual(ans(3));  // and so did Home
    expect(home.get().currentIndex).toBe(3);
  });

  it("an earlier save that fails doesn't stop a later one persisting", async () => {
    const db = fakeRecordsTable(rec({ answers: [], score: 0, currentIndex: 0 }));
    const home = stateOf(rec({ answers: [], score: 0, currentIndex: 0 }));
    const first = launch(db, home, 1, 1);
    const second = launch(db, home, 2, 1);
    await db.deliver(0, "fail");
    await db.deliver(1);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(db.stored.answers).toEqual(ans(2));
    expect(home.get().currentIndex).toBe(2);
  });

  it("normal sequential saves each land", async () => {
    const db = fakeRecordsTable(rec({ answers: [], score: 0, currentIndex: 0 }));
    const home = stateOf(rec({ answers: [], score: 0, currentIndex: 0 }));
    for (let n = 1; n <= 3; n++) {
      const p = launch(db, home, n, n);
      await db.deliver(n - 1);
      expect(await p).toBe(true);
      expect(db.stored.answers).toHaveLength(n);
      expect(home.get().currentIndex).toBe(n);
    }
  });

  it("Home doesn't advance when the save fails, and the database is untouched", async () => {
    const before = rec();
    const db = fakeRecordsTable(before);
    const home = stateOf(before);
    const p = launch(db, home, 2, 1);
    expect(home.get()).toBe(before);             // nothing moves while in flight
    await db.deliver(0, "fail");
    expect(await p).toBe(false);
    expect(home.get()).toBe(before);
    expect(db.stored.answers).toEqual(ans(1));
  });

  it("a late answer save never touches a finished game", async () => {
    const db = fakeRecordsTable(rec({ answers: ans(8), score: 6, completed: true }));
    const home = stateOf(rec({ answers: ans(8), score: 6, completed: true }));
    const late = launch(db, home, 7, 5);
    await db.deliver(0);
    expect(await late).toBe(false);
    expect(db.stored).toMatchObject({ answers: ans(8), score: 6, completed: true });
  });
});

describe("answerWriteApplies (offline backend rule)", () => {
  it("lands only on an unfinished record with fewer answers", () => {
    expect(answerWriteApplies(rec(), ans(2))).toBe(true);
    expect(answerWriteApplies(rec(), ans(1))).toBe(false);
    expect(answerWriteApplies(rec({ answers: ans(3) }), ans(2))).toBe(false);
    expect(answerWriteApplies(rec({ completed: true }), ans(2))).toBe(false);
    expect(answerWriteApplies(null, ans(1))).toBe(false);
  });
});

describe("syncedRecord", () => {
  it("ignores another puzzle, a finished game or no record", () => {
    const other = rec({ puzzleId: "p2" });
    expect(syncedRecord(other, "p1", ans(2), 1)).toBe(other);
    const done = rec({ completed: true });
    expect(syncedRecord(done, "p1", ans(2), 1)).toBe(done);
    expect(syncedRecord(null, "p1", ans(2), 1)).toBe(null);
  });
});
