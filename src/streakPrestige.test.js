import { describe, it, expect } from "vitest";
import {
  streakCycle, streakGrowth, streakFontPx, streakFontForWidth, streakSqueeze, prestigeTheme, totalStreakText,
  STREAK_MIN_PX, STREAK_MAX_PX,
} from "./streakPrestige.js";

describe("streakCycle", () => {
  it.each([
    [1, 1, 0], [2, 2, 0], [50, 50, 0], [99, 99, 0],
    [100, 100, 0], [101, 1, 1], [150, 50, 1], [200, 100, 1],
    [201, 1, 2], [301, 1, 3], [337, 37, 3],
  ])("streak %i -> day %i, prestige %i", (actual, cycleDay, prestigeCount) => {
    expect(streakCycle(actual)).toEqual({ actual, cycleDay, prestigeCount });
  });

  it("stays valid for very large streaks", () => {
    const { cycleDay, prestigeCount } = streakCycle(1000000);
    expect(cycleDay).toBe(100);
    expect(prestigeCount).toBe(9999);
    for (const n of [1000, 12345, 2 ** 40]) {
      const c = streakCycle(n);
      expect(c.cycleDay).toBeGreaterThanOrEqual(1);
      expect(c.cycleDay).toBeLessThanOrEqual(100);
    }
    expect(streakCycle(Number.MAX_SAFE_INTEGER * 4).cycleDay).toBeLessThanOrEqual(100);
  });

  it("has no display for zero or nonsense", () => {
    for (const bad of [0, -3, NaN, undefined, null, "x", Infinity]) {
      expect(streakCycle(bad).cycleDay).toBe(0);
      expect(streakCycle(bad).prestigeCount).toBe(0);
    }
  });
});

describe("streak size", () => {
  const px = (actual) => streakFontPx(streakCycle(actual).cycleDay);

  it("starts modest and ends huge", () => {
    expect(px(1)).toBe(STREAK_MIN_PX);
    expect(px(1)).toBeGreaterThanOrEqual(28);
    expect(px(1)).toBeLessThanOrEqual(34);
    expect(px(100)).toBe(STREAK_MAX_PX);
    expect(px(100)).toBeGreaterThan(10 * px(1));
  });

  it("increases monotonically through a lap", () => {
    for (let d = 2; d <= 100; d++) expect(streakGrowth(d)).toBeGreaterThan(streakGrowth(d - 1));
  });

  it("is generous early and hits the visual targets", () => {
    const near = (day, lo, hi) => { expect(px(day)).toBeGreaterThanOrEqual(lo); expect(px(day)).toBeLessThanOrEqual(hi); };
    near(1, 29, 31);
    near(5, 38, 42);
    near(10, 50, 55);
    near(25, 75, 85);
    near(50, 130, 150);
    near(75, 220, 250);
    near(90, 320, 355);
    near(95, 390, 420);
    expect(px(100)).toBe(STREAK_MAX_PX);
  });

  it("runs away at the end: the last 25 days add more than the first 60", () => {
    expect(px(100) - px(75)).toBeGreaterThan(px(61) - px(1));
  });

  it("depends only on the lap day, never on the prestige", () => {
    // 1 / 101 / 201 / 301 are all small, 100 / 200 / 300 all the maximum.
    for (const n of [101, 201, 301, 1001]) expect(px(n)).toBe(px(1));
    for (const n of [200, 300, 400, 1000]) expect(px(n)).toBe(px(100));
    expect(px(337)).toBe(px(37));
    expect(px(150)).toBe(px(50));
    expect(px(301)).toBeLessThan(35);
    expect(px(110)).toBe(px(10));
    expect(px(300)).toBeGreaterThan(450);
  });

  it("scales to a smaller maximum", () => {
    expect(streakFontPx(100, 190)).toBe(190);
    expect(streakFontPx(1, 190)).toBe(STREAK_MIN_PX);
  });
});

describe("narrow screens", () => {
  const WIDTHS = [320, 375, 430, 768, 1280];

  it("rises strictly every single day at every width: no plateau", () => {
    for (const w of WIDTHS) {
      for (let d = 2; d <= 100; d++) {
        expect(streakFontForWidth(d, w)).toBeGreaterThan(streakFontForWidth(d - 1, w));
      }
    }
  });

  it("leaves the early and mid-range alone, down to day 50", () => {
    for (const w of WIDTHS) {
      for (let d = 1; d <= 50; d++) expect(streakFontForWidth(d, w)).toBeCloseTo(streakFontPx(d), 6);
    }
  });

  it("keeps the wide-screen curve on wide screens", () => {
    for (let d = 1; d <= 100; d++) expect(streakFontForWidth(d, 1280)).toBeCloseTo(streakFontPx(d), 6);
  });

  it("still makes the last days bigger on a phone: 75 < 90 < 95 < 100", () => {
    const f = (d) => streakFontForWidth(d, 375);
    expect(f(90) - f(75)).toBeGreaterThan(20);
    expect(f(95) - f(90)).toBeGreaterThan(15);
    expect(f(100) - f(95)).toBeGreaterThan(15);
    expect(f(100)).toBeGreaterThan(300);
  });

  it("squashes only what does not fit, and never makes the number wider", () => {
    expect(streakSqueeze(100, 2, 351)).toBe(1);
    expect(streakSqueeze(300, 2, 300)).toBe(0.5);
    expect(streakSqueeze(0, 2, 300)).toBe(1);
    // Fitted width never exceeds the room, and the number keeps getting
    // taller even when it is squashed to the same width.
    for (let d = 1; d <= 100; d++) {
      const px = streakFontForWidth(d, 375);
      const em = d === 100 ? 1.9 : 1.2;
      expect(px * em * streakSqueeze(px, em, 351)).toBeLessThanOrEqual(351.0001);
    }
  });
});

describe("prestige themes", () => {
  it("cycles: normal, gold, platinum, fudge, candy, then back to gold", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(prestigeTheme)).toEqual(
      ["classic", "gold", "platinum", "fudge", "candy", "gold", "platinum", "fudge", "candy"]);
    expect(prestigeTheme(9999)).toBeTruthy();
  });
});

describe("totalStreakText", () => {
  it("states the true streak", () => {
    expect(totalStreakText(237)).toBe("237-day total streak");
    expect(totalStreakText(12345)).toBe("12,345-day total streak");
  });
});
