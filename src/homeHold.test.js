import { describe, expect, it } from "vitest";
import { isHoldingHome, nextHomeHold } from "./homeHold.js";

// The completed Home's hold over midnight: which states are kept, and when
// the live day takes over again.
const today = { id: "p-8", date: "2026-10-08" };
const tomorrow = { id: "p-9", date: "2026-10-09" };
const done = { puzzleId: "p-8", completed: true, score: 5, totalQuestions: 12 };
const halfway = { puzzleId: "p-8", completed: false, answers: [{}, {}] };
const live = (over) => ({ view: "home", day: "2026-10-08", game: today, record: done, upNext: tomorrow, ...over });
// The live state right after midnight: the new day's puzzle, not yet played.
const afterMidnight = (over) => live({ day: "2026-10-09", game: tomorrow, record: null, upNext: null, ...over });

// Runs renders in order, like App does, and returns the last hold.
function run(states) {
  let hold = null;
  for (const s of states) hold = nextHomeHold(hold, s);
  return hold;
}

describe("completed Home over midnight", () => {
  it("snapshots the finished puzzle and its next one while Home shows them", () => {
    const hold = run([live()]);
    expect(hold).toEqual({ day: "2026-10-08", game: today, record: done, upNext: tomorrow });
    expect(isHoldingHome(hold, live())).toBe(false); // same day: nothing to hold yet
    expect(nextHomeHold(hold, live())).toBe(hold); // stable across renders
  });

  it("keeps showing it after midnight, through any number of unrelated updates", () => {
    let hold = run([live()]);
    for (let i = 0; i < 5; i++) {
      // sound toggles, How to Play, menu, the new day's data reload: all re-renders
      hold = nextHomeHold(hold, afterMidnight());
      expect(isHoldingHome(hold, afterMidnight())).toBe(true);
      expect(hold.game).toBe(today);
      expect(hold.record).toBe(done);
      expect(hold.upNext).toBe(tomorrow);
    }
  });

  it("holds on Results too, and between Home and Results", () => {
    let hold = run([live(), afterMidnight({ view: "score" })]);
    expect(isHoldingHome(hold, afterMidnight({ view: "score" }))).toBe(true);
    hold = nextHomeHold(hold, afterMidnight({ view: "home" }));
    expect(isHoldingHome(hold, afterMidnight())).toBe(true);
  });

  it("drops the hold when the player leaves for another screen", () => {
    let hold = run([live(), afterMidnight()]);
    hold = nextHomeHold(hold, afterMidnight({ view: "archive" }));
    expect(hold).toBeNull();
    // Coming back to Home now shows the new day.
    hold = nextHomeHold(hold, afterMidnight());
    expect(hold).toBeNull();
    expect(isHoldingHome(hold, afterMidnight())).toBe(false);
  });

  it("never holds an unfinished puzzle, so it can't stay today's daily past midnight", () => {
    for (const record of [null, halfway]) {
      const hold = run([live({ record }), afterMidnight()]);
      expect(hold).toBeNull();
      expect(isHoldingHome(hold, afterMidnight())).toBe(false);
    }
  });

  it("never holds without a next puzzle to count down to", () => {
    expect(run([live({ upNext: null }), afterMidnight()])).toBeNull();
  });

  it("starts fresh after a reload: the new day shows", () => {
    // A reload starts with no hold at all.
    expect(run([afterMidnight()])).toBeNull();
    expect(isHoldingHome(null, afterMidnight())).toBe(false);
  });
});
