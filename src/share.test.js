import { describe, it, expect } from "vitest";
import {
  SHARE_DARE, buildResultsShareText, normalizeShareLabel, shareCategoryName, shareLink, strictlyBetterPercent,
} from "./share.js";

const answersFrom = (pattern) => [...pattern].map((c, i) => ({ questionIndex: i, correct: c === "1" }));
const recordFrom = (pattern) => {
  const answers = answersFrom(pattern);
  return { score: answers.filter((a) => a.correct).length, totalQuestions: answers.length, answers };
};
const circlesFor = (pattern) => [...pattern].map((c) => (c === "1" ? "🟢" : "🔴")).join("");

const CAGE = {
  id: "g-1759600000000",
  categoryA: "Nicolas Cage Movies",
  categoryB: "Board Games",
  categoryAShareName: "Nicolas Cage Movie 🤩🎬",
  categoryBShareName: "Board Game 🎲♟️",
};
const lines = (args) => buildResultsShareText(args).split("\n");

describe("buildResultsShareText", () => {
  it("builds the exact text from the brief: circles, score with the dare, the puzzle's link", () => {
    const text = buildResultsShareText({ game: CAGE, record: recordFrom("110011001111") });
    expect(text).toBe(
      "🟢🟢🔴🔴🟢🟢🔴🔴🟢🟢🟢🟢\n" +
        "8/12 ➜ Can you beat my score?!\n" +
        "https://whatthefudge.gg/puzzle/g-1759600000000"
    );
    expect(SHARE_DARE).toBe("➜ Can you beat my score?!");
  });

  it("has exactly three lines, none blank or with trailing whitespace", () => {
    const all = lines({ game: CAGE, record: recordFrom("110011001111") });
    expect(all).toHaveLength(3);
    for (const line of all) {
      expect(line).not.toBe("");
      expect(line).toBe(line.trimEnd());
      expect(line).not.toMatch(/[\r\t]/);
    }
  });

  it("links to that exact puzzle, whatever its date, and never to today's", () => {
    expect(lines({ game: { ...CAGE, date: "2026-01-01" }, record: recordFrom("1") })[2]).toBe("https://whatthefudge.gg/puzzle/g-1759600000000");
    expect(lines({ game: { ...CAGE, id: "g-other" }, record: recordFrom("1") })[2]).toBe("https://whatthefudge.gg/puzzle/g-other");
  });

  it("encodes unusual ids so the link stays one clickable URL", () => {
    expect(shareLink({ id: "g-1&2=ü" })).toBe("https://whatthefudge.gg/puzzle/g-1%262%3D%C3%BC");
  });

  it("falls back to the site itself when the puzzle has no usable id", () => {
    for (const game of [null, {}, { id: "" }, { id: "a/b" }, { id: 42 }]) {
      expect(lines({ game, record: recordFrom("10") })[2]).toBe("https://whatthefudge.gg");
    }
  });

  it("has no percentage, header, divider, category name or OR", () => {
    const text = buildResultsShareText({ game: CAGE, record: recordFrom("110011001111"), beatPercent: 77 });
    for (const part of ["Beat", "%", "•", "What The Fudge Trivia", "━", "Nicolas Cage", "Board Game", " OR"]) {
      expect(text).not.toContain(part);
    }
  });

  it("builds the circles from the saved answers, in order, not from the score", () => {
    expect(lines({ game: CAGE, record: recordFrom("01010") })[0]).toBe("🔴🟢🔴🟢🔴");
    expect(lines({ game: CAGE, record: recordFrom("10100") })[0]).toBe("🟢🔴🟢🔴🔴");
    // Same score, different answers: different circles.
    const a = lines({ game: CAGE, record: { score: 2, totalQuestions: 4, answers: answersFrom("1100") } })[0];
    const b = lines({ game: CAGE, record: { score: 2, totalQuestions: 4, answers: answersFrom("0011") } })[0];
    expect(a).toBe("🟢🟢🔴🔴");
    expect(b).toBe("🔴🔴🟢🟢");
    expect(a + b).not.toMatch(/[⬜🟩🟥 ]/u);
  });

  it.each([
    ["8/8", "11111111"],
    ["5/8", "10110101"],
    ["9/12", "110111011101"],
    ["10/13", "1101101111101"],
    ["0/13", "0000000000000"],
    ["11/15", "110111011101110"],
    ["15/15", "111111111111111"],
  ])("handles %s with one circle per question", (expected, pattern) => {
    const all = lines({ game: CAGE, record: recordFrom(pattern) });
    expect(all).toHaveLength(3);
    expect(all[0]).toBe(circlesFor(pattern));
    expect([...all[0]]).toHaveLength(pattern.length);
    expect(all[1]).toBe(`${expected} ➜ Can you beat my score?!`);
  });

  it("treats a missing or malformed record as 0/0 with no circles", () => {
    expect(lines({ game: CAGE, record: null })[1]).toBe("0/0 ➜ Can you beat my score?!");
  });
});

describe("share names (used by link previews)", () => {
  it("fall back to the gameplay category names when missing or blank", () => {
    expect(shareCategoryName("", "Board Game", "Category A")).toBe("Board Game");
    expect(shareCategoryName(" \n\t ", "Nicolas Cage Movie", "Category B")).toBe("Nicolas Cage Movie");
    expect(shareCategoryName(null, undefined, "Category A")).toBe("Category A");
    expect(shareCategoryName("Nicolas Cage Movie 🤩🎬", "Nicolas Cage Movies", "Category A")).toBe("Nicolas Cage Movie 🤩🎬");
  });

  it("put pasted newlines, tabs and repeated spaces on one line", () => {
    expect(shareCategoryName("  Nicolas\nCage\r\n Movie\t\t🤩🎬  ", "", "Category A")).toBe("Nicolas Cage Movie 🤩🎬");
    expect(shareCategoryName("", "  Harry\tPotter \n Characters ", "Category A")).toBe("Harry Potter Characters");
  });

  it("keep emoji sequences intact while normalizing", () => {
    expect(normalizeShareLabel(" Harry Potter Character 🧙‍♂️ ")).toBe("Harry Potter Character 🧙‍♂️");
    expect(normalizeShareLabel("Board Game 🎲♟️")).toBe("Board Game 🎲♟️");
    expect(normalizeShareLabel(undefined)).toBe("");
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
