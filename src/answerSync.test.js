import { describe, expect, it } from "vitest";
import { saveAnswerThenSync, syncedRecord } from "./answerSync.js";

const rec = (over = {}) => ({
  puzzleId: "p1", score: 1, totalQuestions: 8, currentIndex: 1,
  answers: [{ correct: true }], completed: false, ...over,
});
const two = [{ correct: true }, { correct: false }];

// A tiny stand-in for a React state setter.
function stateOf(initial) {
  let value = initial;
  return { get: () => value, set: (update) => { value = typeof update === "function" ? update(value) : update; } };
}

describe("saveAnswerThenSync", () => {
  it("updates Home's record after a successful save", async () => {
    const state = stateOf(rec());
    const ok = await saveAnswerThenSync({ save: async () => {}, setRecord: state.set, puzzleId: "p1", answers: two, score: 1 });
    expect(ok).toBe(true);
    expect(state.get()).toMatchObject({ answers: two, score: 1, currentIndex: 2, completed: false });
  });

  it("leaves Home's record alone when the save fails", async () => {
    const before = rec();
    const state = stateOf(before);
    const ok = await saveAnswerThenSync({
      save: async () => { throw new Error("Supabase error 500"); },
      setRecord: state.set, puzzleId: "p1", answers: two, score: 1,
    });
    expect(ok).toBe(false);
    expect(state.get()).toBe(before);
  });

  it("does not update before the save has finished", async () => {
    const state = stateOf(rec());
    let finish;
    const pending = saveAnswerThenSync({
      save: () => new Promise((r) => { finish = r; }), setRecord: state.set, puzzleId: "p1", answers: two, score: 1,
    });
    expect(state.get().answers).toHaveLength(1);
    finish();
    await pending;
    expect(state.get().answers).toHaveLength(2);
  });
});

describe("syncedRecord", () => {
  it("ignores another puzzle, a finished game or no record", () => {
    const other = rec({ puzzleId: "p2" });
    expect(syncedRecord(other, "p1", two, 1)).toBe(other);
    const done = rec({ completed: true });
    expect(syncedRecord(done, "p1", two, 1)).toBe(done);
    expect(syncedRecord(null, "p1", two, 1)).toBe(null);
  });

  it("never winds the count back when an older save finishes late", () => {
    const ahead = rec({ answers: [...two, { correct: true }], currentIndex: 3, score: 2 });
    expect(syncedRecord(ahead, "p1", two, 1)).toBe(ahead);
  });
});
