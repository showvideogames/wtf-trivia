import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionGameDay } from "./dailySession.js";
import { gameDayKey } from "./schedule.js";

// The page's game day over midnight: which sessions keep their day, and
// when the clock's day takes over.
const OCT8 = "2026-10-08";
const OCT9 = "2026-10-09";
const started = { puzzleId: "p-8", completed: false, answers: [{}, {}] };
const fresh = { puzzleId: "p-8", completed: false, answers: [] };
const done = { puzzleId: "p-8", completed: true, answers: [{}, {}, {}] };
const after = (over) => sessionGameDay({ gameDay: OCT8, liveDay: OCT9, view: "home", record: null, ...over });

describe("the daily session's game day", () => {
  afterEach(() => vi.useRealTimers());

  it("is the clock's day while the two agree", () => {
    for (const record of [null, fresh, started, done]) {
      expect(sessionGameDay({ gameDay: OCT8, liveDay: OCT8, view: "home", record })).toBe(OCT8);
    }
  });

  it("keeps a game on screen past midnight, even before its first answer", () => {
    expect(after({ view: "game", record: fresh })).toBe(OCT8);
    expect(after({ view: "game", record: started })).toBe(OCT8);
  });

  it("keeps a started or finished puzzle on every screen", () => {
    for (const view of ["home", "score", "archive", "stats", "account", "puzzle"]) {
      expect(after({ view, record: started })).toBe(OCT8);
      expect(after({ view, record: done })).toBe(OCT8);
    }
  });

  it("moves on when the session never played that day's puzzle", () => {
    expect(after({ record: null })).toBe(OCT9);
    expect(after({ record: fresh })).toBe(OCT9); // Play pressed, then back to Home, nothing answered
    expect(after({ view: "archive", record: null })).toBe(OCT9);
  });

  it("is stable across any number of renders once held", () => {
    let day = OCT8;
    for (let i = 0; i < 5; i++) day = sessionGameDay({ gameDay: day, liveDay: OCT9, view: "score", record: done });
    expect(day).toBe(OCT8);
  });

  it("starts from the clock's day on a new page load, after midnight", () => {
    // App's first game day is gameDayKey() at load: a previous day's record
    // can't bring the previous day back.
    vi.useFakeTimers({ now: new Date(2026, 9, 9, 0, 10) });
    const loaded = gameDayKey();
    expect(loaded).toBe(OCT9);
    expect(sessionGameDay({ gameDay: loaded, liveDay: gameDayKey(), view: "home", record: null })).toBe(OCT9);
  });
});
