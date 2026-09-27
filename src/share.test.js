import { describe, it, expect } from "vitest";
import { buildResultsShareText, shareCategoryName, strictlyBetterPercent, SHARE_DOMAIN } from "./share.js";

const answersFrom = (pattern) => [...pattern].map((c, i) => ({ questionIndex: i, correct: c === "1" }));
const recordFrom = (pattern) => {
  const answers = answersFrom(pattern);
  return { score: answers.filter((a) => a.correct).length, totalQuestions: answers.length, answers };
};

const HOCKEY = {
  categoryA: "Harry Potter Characters",
  categoryB: "Professional Hockey Players",
  categoryAShareName: "Harry Potter Character 🧙‍♂️",
  categoryBShareName: "Pro Hockey Player? 🏒",
};

describe("buildResultsShareText", () => {
  it("builds the exact six-line text from the brief", () => {
    const text = buildResultsShareText({
      game: HOCKEY,
      record: recordFrom("0001111100"),
      // 10 finishers: 2 below 5, 3 tied at 5 (you included), 5 above.
      histogram: { 4: 2, 5: 3, 7: 5 },
    });
    expect(text).toBe(
      "Harry Potter Character 🧙‍♂️\n" +
        "OR\n" +
        "Pro Hockey Player? 🏒\n" +
        "🔴🔴🔴🟢🟢🟢🟢🟢🔴🔴\n" +
        "5/10 ➜ Better than 20%\n" +
        "whatthefudgetrivia.com"
    );
  });

  it("never includes the brand name line", () => {
    const text = buildResultsShareText({ game: HOCKEY, record: recordFrom("10"), histogram: null });
    expect(text).not.toMatch(/What The Fudge Trivia/);
    expect(text.split("\n").at(-1)).toBe(SHARE_DOMAIN);
  });

  it("falls back to the normal category names when both share names are blank", () => {
    const game = { categoryA: "Board Game", categoryB: "Nicolas Cage Movie", categoryAShareName: "", categoryBShareName: "   " };
    const [a, or, b] = buildResultsShareText({ game, record: recordFrom("1"), histogram: null }).split("\n");
    expect([a, or, b]).toEqual(["Board Game", "OR", "Nicolas Cage Movie"]);
  });

  it("mixes one custom name with one fallback", () => {
    const game = { ...HOCKEY, categoryBShareName: "" };
    const [a, , b] = buildResultsShareText({ game, record: recordFrom("1"), histogram: null }).split("\n");
    expect(a).toBe("Harry Potter Character 🧙‍♂️");
    expect(b).toBe("Professional Hockey Players");
  });

  it("works for existing puzzles that have no share-name fields at all", () => {
    const game = { categoryA: "Board Game", categoryB: "Nicolas Cage Movie" };
    const [a, , b] = buildResultsShareText({ game, record: recordFrom("1"), histogram: null }).split("\n");
    expect([a, b]).toEqual(["Board Game", "Nicolas Cage Movie"]);
  });

  it("uses generic labels only when the puzzle itself is missing", () => {
    const [a, , b] = buildResultsShareText({ game: null, record: recordFrom("1"), histogram: null }).split("\n");
    expect([a, b]).toEqual(["Category A", "Category B"]);
  });

  it("trims share names but keeps their emoji and punctuation", () => {
    expect(shareCategoryName("  Pro Hockey Player? 🏒  ", "Professional Hockey Players", "Category B")).toBe("Pro Hockey Player? 🏒");
  });

  it.each([
    ["5/5", "11111"],
    ["6/8", "10110111"],
    ["10/13", "1101101111101"],
    ["15/15", "111111111111111"],
    ["0/10", "0000000000"],
    ["0/15", "000000000000000"],
  ])("handles %s with one dot per question, in order", (expected, pattern) => {
    const lines = buildResultsShareText({ game: HOCKEY, record: recordFrom(pattern), histogram: null }).split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[3]).toBe([...pattern].map((c) => (c === "1" ? "🟢" : "🔴")).join(""));
    expect(lines[4]).toBe(expected);
  });

  it("keeps dots in answer order, not grouped", () => {
    const lines = buildResultsShareText({ game: HOCKEY, record: recordFrom("01010"), histogram: null }).split("\n");
    expect(lines[3]).toBe("🔴🟢🔴🟢🔴");
  });

  it("shows only the score when crowd data is unavailable", () => {
    for (const histogram of [null, undefined, {}]) {
      const lines = buildResultsShareText({ game: HOCKEY, record: recordFrom("0001111100"), histogram }).split("\n");
      expect(lines[4]).toBe("5/10");
    }
  });

  it("says 'Better than 0%' when several finished and nobody scored lower", () => {
    const lines = buildResultsShareText({ game: HOCKEY, record: recordFrom("0000000000"), histogram: { 0: 1, 4: 2, 7: 5 } }).split("\n");
    expect(lines[4]).toBe("0/10 ➜ Better than 0%");
  });
});

describe("strictlyBetterPercent", () => {
  it("excludes every player tied with you", () => {
    // 20 finishers: 4 lower, 8 tied at 6 (you included), 8 higher.
    expect(strictlyBetterPercent({ 2: 1, 5: 3, 6: 8, 9: 8 }, 6)).toBe(20);
  });

  it("differs from the tied-or-better Crowd Showdown number", () => {
    const histogram = { 4: 2, 5: 3, 7: 5 };
    const tiedOrBetter = Math.round(((2 + 3) / 10) * 100); // Crowd Showdown's formula
    expect(tiedOrBetter).toBe(50);
    expect(strictlyBetterPercent(histogram, 5)).toBe(20);
  });

  it("returns null for the only finisher", () => {
    expect(strictlyBetterPercent({ 7: 1 }, 7)).toBeNull();
  });

  it("returns 0 for the lowest score among several finishers, including a tie for lowest", () => {
    expect(strictlyBetterPercent({ 0: 1, 4: 5, 8: 3 }, 0)).toBe(0);
    expect(strictlyBetterPercent({ 3: 4, 6: 5 }, 3)).toBe(0);
  });

  it("returns 0 when everyone tied", () => {
    expect(strictlyBetterPercent({ 5: 12 }, 5)).toBe(0);
  });

  it("never reaches 100% for a unique top score, since you are one of the players", () => {
    // 142 finishers, you alone perfect: 141/142 = 99.3% -> 99.
    expect(strictlyBetterPercent({ 3: 40, 6: 101, 10: 1 }, 10)).toBe(99);
    // Even with two finishers: 1/2 = 50%.
    expect(strictlyBetterPercent({ 3: 1, 10: 1 }, 10)).toBe(50);
    // And with a huge crowd it still floors below 100.
    expect(strictlyBetterPercent({ 0: 99999, 10: 1 }, 10)).toBe(99);
  });

  it("refuses a histogram that doesn't include you (never 'Better than 100%')", () => {
    // Stats read before your game was counted: everyone in it scored lower.
    expect(strictlyBetterPercent({ 3: 40, 6: 101 }, 10)).toBeNull();
  });

  it("does not count other perfect scorers as beaten", () => {
    // 10 finishers, 3 perfect (you included): 7/10 = 70%.
    expect(strictlyBetterPercent({ 6: 7, 10: 3 }, 10)).toBe(70);
  });

  it("rounds down so it never overstates", () => {
    // 2 of 3 = 66.67% -> 66, not 67.
    expect(strictlyBetterPercent({ 1: 2, 5: 1 }, 5)).toBe(66);
    // 1 of 201 = 0.49% -> 0.
    expect(strictlyBetterPercent({ 1: 1, 5: 200 }, 5)).toBe(0);
  });

  it("ignores malformed histogram entries", () => {
    expect(strictlyBetterPercent({ x: 5, 2: "3", 4: -1, 6: 1.5, 8: 1 }, 8)).toBe(75);
  });

  it("is never above 99 for any valid histogram that includes you", () => {
    for (let total = 2; total <= 300; total++) {
      for (const atScore of [1, 2, Math.max(1, total - 1)]) {
        const lower = total - atScore;
        expect(strictlyBetterPercent({ 0: lower, 10: atScore }, 10)).toBeLessThanOrEqual(99);
      }
    }
  });
});
