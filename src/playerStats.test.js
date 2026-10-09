import { afterEach, describe, expect, it, vi } from "vitest";
import { statsAfterFinish } from "./playerStats.js";

// Streaks follow puzzle days, so finishing a puzzle after midnight counts
// for the puzzle's own day.
const base = { currentStreak: 3, longestStreak: 5, lastPlayedDate: "2026-10-07", totalPlayed: 10, totalCorrect: 60, totalQuestions: 80, bestCombo: 4 };
const finish = (stats, over) => statsAfterFinish(stats, { date: "2026-10-08", score: 6, totalQuestions: 8, bestCombo: 2, ...over });

describe("statsAfterFinish", () => {
  afterEach(() => vi.useRealTimers());

  it("continues the streak for Oct 8's puzzle finished at 00:10 on Oct 9", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 9, 0, 10) });
    const s = finish(base);
    expect(s.currentStreak).toBe(4);
    expect(s.lastPlayedDate).toBe("2026-10-08");
    expect(s.totalPlayed).toBe(11);
  });

  it("gives the same result before midnight", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 8, 23, 50) });
    expect(finish(base)).toEqual(finish(base));
    expect(finish(base).currentStreak).toBe(4);
  });

  it("restarts at 1 after a missed puzzle day, whatever the clock", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 9, 0, 10) });
    expect(finish({ ...base, lastPlayedDate: "2026-10-06" }).currentStreak).toBe(1);
  });

  it("then carries on into the next day's puzzle", () => {
    const oct8 = finish(base);
    const oct9 = finish(oct8, { date: "2026-10-09" });
    expect([oct9.currentStreak, oct9.lastPlayedDate, oct9.totalPlayed]).toEqual([5, "2026-10-09", 12]);
  });

  it("keeps the streak as is when the same day is counted again", () => {
    expect(finish({ ...base, lastPlayedDate: "2026-10-08" }).currentStreak).toBe(3);
  });

  it("keeps the longest streak and best combo as the maximum, and leaves the input alone", () => {
    const s = finish({ ...base, currentStreak: 5, longestStreak: 5 }, { bestCombo: 7 });
    expect([s.longestStreak, s.bestCombo]).toEqual([6, 7]);
    expect(base.currentStreak).toBe(3);
  });
});
