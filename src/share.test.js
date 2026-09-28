import { describe, it, expect } from "vitest";
import {
  buildResultsShareText, normalizeShareLabel, shareCategoryName, strictlyBetterPercent,
  SHARE_DIVIDER, SHARE_DOMAIN, SHARE_HEADER, SHARE_OR,
} from "./share.js";

const answersFrom = (pattern) => [...pattern].map((c, i) => ({ questionIndex: i, correct: c === "1" }));
const recordFrom = (pattern) => {
  const answers = answersFrom(pattern);
  return { score: answers.filter((a) => a.correct).length, totalQuestions: answers.length, answers };
};
const circlesFor = (pattern) => [...pattern].map((c) => (c === "1" ? "🟢" : "🔴")).join("");

const CAGE = {
  categoryA: "Nicolas Cage Movies",
  categoryB: "Board Games",
  categoryAShareName: "Nicolas Cage Movie 🤩🎬",
  categoryBShareName: "Board Game 🎲♟️",
};
const lines = (args) => buildResultsShareText(args).split("\n");

describe("buildResultsShareText", () => {
  it("builds the exact text from the brief", () => {
    const text = buildResultsShareText({ game: CAGE, record: recordFrom("110011001111"), beatPercent: 77 });
    expect(text).toBe(
      "What The Fudge Trivia 🍬\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "Nicolas Cage Movie 🤩🎬\n" +
        "     OR\n" +
        "Board Game 🎲♟️\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🟢🟢🔴🔴🟢🟢🔴🔴🟢🟢🟢🟢\n" +
        "8/12 • Beat 77% of players\n" +
        "whatthefudge.gg"
    );
  });

  it("has exactly nine lines with a percentage, none blank or with trailing whitespace", () => {
    const all = lines({ game: CAGE, record: recordFrom("110011001111"), beatPercent: 77 });
    expect(all).toHaveLength(9);
    for (const line of all) {
      expect(line).not.toBe("");
      expect(line).toBe(line.trimEnd());
      expect(line).not.toMatch(/[\r\t]/);
    }
  });

  it("uses a fixed 26-character heavy divider and a fixed five-space OR", () => {
    expect(SHARE_DIVIDER).toBe("━".repeat(26));
    expect([...SHARE_DIVIDER]).toHaveLength(26);
    expect(SHARE_DIVIDER).toMatch(/^━{26}$/);
    expect(SHARE_OR).toBe("     OR");
    expect(SHARE_OR).toMatch(/^ {5}OR$/);
    // The same whatever the labels' length.
    for (const game of [CAGE, { categoryA: "A", categoryB: "B" }, { categoryAShareName: "x".repeat(80), categoryBShareName: "Y" }]) {
      const all = lines({ game, record: recordFrom("10"), beatPercent: null });
      expect(all[1]).toBe(SHARE_DIVIDER);
      expect(all[3]).toBe(SHARE_OR);
      expect(all[5]).toBe(SHARE_DIVIDER);
    }
  });

  it("always starts with the fixed header and ends with the fixed domain", () => {
    const all = lines({ game: CAGE, record: recordFrom("10"), beatPercent: null });
    expect(all[0]).toBe("What The Fudge Trivia 🍬");
    expect(SHARE_HEADER).toBe("What The Fudge Trivia 🍬");
    expect(all.at(-1)).toBe("whatthefudge.gg");
    expect(SHARE_DOMAIN).toBe("whatthefudge.gg");
  });

  it("never contains the old header, arrow or domain", () => {
    const text = buildResultsShareText({ game: CAGE, record: recordFrom("110011001111"), beatPercent: 77 });
    expect(text).not.toMatch(/WTF Trivia|➜|whatthefudgetrivia|https?:|\.gg\//);
  });

  it("falls back to the gameplay category names when share names are missing or blank", () => {
    const blank = { categoryA: "Board Game", categoryB: "Nicolas Cage Movie", categoryAShareName: "", categoryBShareName: " \n\t " };
    expect(lines({ game: blank, record: recordFrom("1") }).slice(2, 5)).toEqual(["Board Game", SHARE_OR, "Nicolas Cage Movie"]);
    const none = { categoryA: "Board Game", categoryB: "Nicolas Cage Movie" };
    expect(lines({ game: none, record: recordFrom("1") }).slice(2, 5)).toEqual(["Board Game", SHARE_OR, "Nicolas Cage Movie"]);
    const nulls = { ...none, categoryAShareName: null, categoryBShareName: undefined };
    expect(lines({ game: nulls, record: recordFrom("1") }).slice(2, 5)).toEqual(["Board Game", SHARE_OR, "Nicolas Cage Movie"]);
  });

  it("mixes one share name with one fallback", () => {
    const all = lines({ game: { ...CAGE, categoryBShareName: "" }, record: recordFrom("1") });
    expect(all[2]).toBe("Nicolas Cage Movie 🤩🎬");
    expect(all[4]).toBe("Board Games");
  });

  it("uses generic labels only when the puzzle itself is missing", () => {
    expect(lines({ game: null, record: recordFrom("1") }).slice(2, 5)).toEqual(["Category A", SHARE_OR, "Category B"]);
  });

  it("puts pasted newlines, tabs and repeated spaces in a label on one line", () => {
    const game = {
      categoryAShareName: "  Nicolas\nCage\r\n Movie\t\t🤩🎬  ",
      categoryBShareName: "Board    Game   🎲♟️",
    };
    const all = lines({ game, record: recordFrom("10"), beatPercent: 50 });
    expect(all).toHaveLength(9);
    expect(all[2]).toBe("Nicolas Cage Movie 🤩🎬");
    expect(all[4]).toBe("Board Game 🎲♟️");
    // The fallback name is normalized the same way.
    expect(shareCategoryName("", "  Harry\tPotter \n Characters ", "Category A")).toBe("Harry Potter Characters");
  });

  it("keeps emoji sequences intact while normalizing", () => {
    expect(normalizeShareLabel(" Harry Potter Character 🧙‍♂️ ")).toBe("Harry Potter Character 🧙‍♂️");
    expect(normalizeShareLabel("Board Game 🎲♟️")).toBe("Board Game 🎲♟️");
    expect(normalizeShareLabel(undefined)).toBe("");
  });

  it("adds no trailing space to a label without emoji", () => {
    const game = { categoryAShareName: "Board Game ", categoryBShareName: "Pro Hockey Player?" };
    const all = lines({ game, record: recordFrom("1"), beatPercent: null });
    expect(all[2]).toBe("Board Game");
    expect(all[4]).toBe("Pro Hockey Player?");
  });

  it("does not truncate, pad or centre long labels", () => {
    const long = "The Extremely Long Category Name That Will Certainly Wrap On A Phone 🤩🎬";
    const all = lines({ game: { categoryAShareName: long, categoryBShareName: "B" }, record: recordFrom("1") });
    expect(all[2]).toBe(long);
    expect(all[4]).toBe("B");
  });

  it("shows only {score}/{total} without a valid percentage", () => {
    for (const beatPercent of [null, undefined, NaN, -1, 100, 150, 77.5, "77", Infinity]) {
      const all = lines({ game: CAGE, record: recordFrom("110011001111"), beatPercent });
      expect(all).toHaveLength(9);
      expect(all[7]).toBe("8/12");
    }
    const text = buildResultsShareText({ game: CAGE, record: recordFrom("110011001111") });
    expect(text).not.toMatch(/•|Beat|%/);
  });

  it("prints 0% and 99% as given", () => {
    expect(lines({ game: CAGE, record: recordFrom("0000000000"), beatPercent: 0 })[7]).toBe("0/10 • Beat 0% of players");
    expect(lines({ game: CAGE, record: recordFrom("111111111111111"), beatPercent: 99 })[7]).toBe("15/15 • Beat 99% of players");
  });

  it("builds the circles from the saved answers, in order, not from the score", () => {
    expect(lines({ game: CAGE, record: recordFrom("01010") })[6]).toBe("🔴🟢🔴🟢🔴");
    expect(lines({ game: CAGE, record: recordFrom("10100") })[6]).toBe("🟢🔴🟢🔴🔴");
    // Same score, different answers: different circles.
    const a = lines({ game: CAGE, record: { score: 2, totalQuestions: 4, answers: answersFrom("1100") } })[6];
    const b = lines({ game: CAGE, record: { score: 2, totalQuestions: 4, answers: answersFrom("0011") } })[6];
    expect(a).toBe("🟢🟢🔴🔴");
    expect(b).toBe("🔴🔴🟢🟢");
    expect(a + b).not.toMatch(/[⬜🟩🟥 ]/u);
  });

  it.each([
    ["8/8", "11111111"],
    ["5/8", "10110101"],
    ["8/12", "110011001111"],
    ["10/13", "1101101111101"],
    ["0/13", "0000000000000"],
    ["11/15", "110111011101110"],
    ["15/15", "111111111111111"],
  ])("handles %s with one circle per question", (expected, pattern) => {
    const all = lines({ game: CAGE, record: recordFrom(pattern), beatPercent: null });
    expect(all).toHaveLength(9);
    expect(all[6]).toBe(circlesFor(pattern));
    expect([...all[6]]).toHaveLength(pattern.length);
    expect(all[7]).toBe(expected);
  });
});

describe("strictlyBetterPercent", () => {
  it("excludes every player tied with you", () => {
    // 20 finishers: 4 lower, 8 tied at 6 (you included), 8 higher.
    expect(strictlyBetterPercent({ 2: 1, 5: 3, 6: 8, 9: 8 }, 6)).toBe(20);
  });

  it("Mario Kart: 51 finishers, three at 8/8, 48 lower: 94", () => {
    expect(strictlyBetterPercent({ 3: 10, 5: 18, 7: 20, 8: 3 }, 8)).toBe(94);
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

  it("refuses a histogram that doesn't include you (never 'Beat 100% of players')", () => {
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

describe("strictlyBetterPercent for unsaved scores (includesPlayer: false)", () => {
  const unsaved = (histogram, score) => strictlyBetterPercent(histogram, score, { includesPlayer: false });

  it("needs no one at your score", () => {
    expect(unsaved({ 2: 5, 4: 6, 7: 9, 13: 1 }, 6)).toBe(52);
    expect(strictlyBetterPercent({ 2: 5, 4: 6, 7: 9, 13: 1 }, 6)).toBeNull();
  });

  it("works with a single historical finisher, capped at 99", () => {
    expect(unsaved({ 4: 1 }, 10)).toBe(99);
    expect(unsaved({ 4: 1 }, 2)).toBe(0);
  });

  it("returns null with no historical finishers or no data", () => {
    expect(unsaved({}, 5)).toBeNull();
    expect(unsaved(null, 5)).toBeNull();
    expect(unsaved({ 3: 2 }, NaN)).toBeNull();
  });

  it("is never above 99", () => {
    for (let total = 1; total <= 300; total++) expect(unsaved({ 0: total }, 10)).toBe(99);
  });
});
