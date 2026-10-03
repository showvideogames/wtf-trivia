import { describe, expect, it } from "vitest";
import { archivePuzzles, filterArchive, matchesArchiveSearch } from "./archiveList.js";

const g = (id, date, extra = {}) => ({
  id,
  date,
  status: "published",
  themeTitle: `Title ${id}`,
  categoryA: `A${id}`,
  categoryB: `B${id}`,
  ...extra,
});

describe("archivePuzzles", () => {
  const games = [
    g("old", "2026-09-01"),
    g("today", "2026-10-03"),
    g("future-draft", "2026-10-05", { status: "draft" }),
    g("mid", "2026-09-20"),
    g("retired-played", "2026-09-10", { status: "retired" }),
    g("retired-unplayed", "2026-09-11", { status: "retired" }),
  ];
  const records = { "retired-played": { completed: true, score: 5, totalQuestions: 8 } };

  it("keeps the existing inclusion rule and puts today first, then newest first", () => {
    const { puzzles, todayGame } = archivePuzzles(games, records, "2026-10-03");
    expect(todayGame.id).toBe("today");
    expect(puzzles.map((p) => p.id)).toEqual(["today", "mid", "retired-played", "old"]);
  });

  it("never treats a retired puzzle as today's", () => {
    const { todayGame } = archivePuzzles(
      [g("r", "2026-10-03", { status: "retired" })],
      { r: { completed: true } },
      "2026-10-03",
    );
    expect(todayGame).toBeNull();
  });
});

describe("matchesArchiveSearch", () => {
  const game = g("x", "2026-01-01", {
    themeTitle: "Board Game or Nicolas Cage Movie?",
    categoryA: "Board Game",
    categoryB: "Nicolas Cage Movie",
  });

  it("matches the title and category names, ignoring case", () => {
    expect(matchesArchiveSearch(game, "nicolas")).toBe(true);
    expect(matchesArchiveSearch(game, "BOARD")).toBe(true);
    expect(matchesArchiveSearch(game, "dinosaur")).toBe(false);
  });

  it("requires every typed word somewhere", () => {
    expect(matchesArchiveSearch(game, "nic cage")).toBe(true);
    expect(matchesArchiveSearch(game, "cage dinosaur")).toBe(false);
  });

  it("matches a category name that is not in the title", () => {
    const other = g("y", "2026-01-01", { themeTitle: "Puppet or Singer?", categoryA: "Muppet" });
    expect(matchesArchiveSearch(other, "muppet")).toBe(true);
  });

  it("treats a blank query as a match", () => {
    expect(matchesArchiveSearch(game, "   ")).toBe(true);
  });
});

describe("filterArchive", () => {
  const puzzles = [g("a", "2026-01-03"), g("b", "2026-01-02"), g("c", "2026-01-01")];
  const records = {
    a: { completed: true, score: 8, totalQuestions: 8 },
    b: { completed: false, answers: [{}] },
  };

  it("All keeps everything", () => {
    expect(filterArchive(puzzles, records, { filter: "all" }).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("Completed keeps finished puzzles only", () => {
    expect(filterArchive(puzzles, records, { filter: "completed" }).map((p) => p.id)).toEqual(["a"]);
  });

  it("Unplayed counts an unfinished puzzle as unplayed", () => {
    expect(filterArchive(puzzles, records, { filter: "unplayed" }).map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("combines search with the filter", () => {
    expect(filterArchive(puzzles, records, { filter: "unplayed", query: "title c" }).map((p) => p.id)).toEqual(["c"]);
  });
});
