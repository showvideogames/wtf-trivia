import { describe, it, expect } from "vitest";
import { countdownGroups, countdownParts, countdownWords, nextPuzzle, releaseTime } from "./upNext.js";

const g = (id, date, status = "published") => ({ id, date, status });

describe("nextPuzzle", () => {
  const today = "2026-10-06";

  it("is the soonest published puzzle after today", () => {
    const games = [g("later", "2026-10-09"), g("today", today), g("past", "2026-10-01"), g("next", "2026-10-07")];
    expect(nextPuzzle(games, today).id).toBe("next");
  });

  it("never picks a draft or a retired puzzle, even on a nearer date", () => {
    const games = [g("draft", "2026-10-07", "draft"), g("retired", "2026-10-07", "retired"), g("odd", "2026-10-07", null), g("next", "2026-10-10")];
    expect(nextPuzzle(games, today).id).toBe("next");
  });

  it("is null when nothing published comes after today", () => {
    expect(nextPuzzle([g("today", today), g("draft", "2026-10-08", "draft")], today)).toBeNull();
    expect(nextPuzzle([], today)).toBeNull();
    expect(nextPuzzle(null, today)).toBeNull();
  });

  it("ignores puzzles without a real date and breaks a same-day tie by id", () => {
    const games = [g("blank", ""), g("bad", "soon"), g("b", "2026-10-08"), g("a", "2026-10-08")];
    expect(nextPuzzle(games, today).id).toBe("a");
  });
});

describe("releaseTime", () => {
  it("is local midnight at the start of the day", () => {
    const at = releaseTime("2026-10-07");
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 9, 7, 0, 0]);
  });
  it("refuses impossible dates", () => {
    expect(releaseTime("2026-02-30")).toBeNull();
    expect(releaseTime("")).toBeNull();
    expect(releaseTime(undefined)).toBeNull();
  });
});

describe("countdown", () => {
  const ms = (d, h, m, s) => ((d * 24 + h) * 60 + m) * 60000 + s * 1000;

  it("splits the time and never goes negative", () => {
    expect(countdownParts(ms(1, 2, 3, 4) + 999)).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4 });
    expect(countdownParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("shows hours, minutes and seconds, adding days only when there are any", () => {
    expect(countdownGroups(ms(0, 5, 9, 3)).map((x) => x.value)).toEqual(["05", "09", "03"]);
    expect(countdownGroups(ms(1, 0, 0, 0))[0]).toEqual({ unit: "day", value: "1" });
    expect(countdownGroups(ms(3, 1, 0, 0))[0]).toEqual({ unit: "days", value: "3" });
  });

  it("says the time in words, to the minute", () => {
    expect(countdownWords(ms(1, 4, 3, 50))).toBe("1 day, 4 hours and 3 minutes");
    expect(countdownWords(ms(0, 2, 0, 10))).toBe("2 hours");
    expect(countdownWords(ms(0, 0, 1, 0))).toBe("1 minute");
    expect(countdownWords(ms(0, 0, 0, 30))).toBe("less than a minute");
    expect(countdownWords(0)).toBe("0 minutes");
  });
});
