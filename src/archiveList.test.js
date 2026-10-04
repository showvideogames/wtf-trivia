import { describe, expect, it } from "vitest";
import { archivePuzzles, archiveTopicCounts, filterArchive, matchesArchiveSearch } from "./archiveList.js";

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

describe("matchesArchiveSearch: topics and accents", () => {
  const pokemon = g("p", "2026-01-01", { themeTitle: "Planet OR Pokémon?", categoryA: "Planet", categoryB: "Pokémon" });
  const plain = g("q", "2026-01-01", { themeTitle: "Pokemon or Digimon?", categoryA: "Pokemon", categoryB: "Digimon" });

  it("matches a topic label", () => {
    const tagged = g("t", "2026-01-01", { themeTitle: "Puppet or Singer?", tags: ["music", "words_language"] });
    expect(matchesArchiveSearch(tagged, "music")).toBe(true);
    expect(matchesArchiveSearch(tagged, "words & language")).toBe(true);
    expect(matchesArchiveSearch(tagged, "language puppet")).toBe(true);
    expect(matchesArchiveSearch(tagged, "gaming")).toBe(false);
  });

  it("never matches a topic id or a topic the puzzle doesn't have", () => {
    const tagged = g("t", "2026-01-01", { tags: ["board_games"] });
    expect(matchesArchiveSearch(tagged, "board_games")).toBe(false);
    expect(matchesArchiveSearch(tagged, "board games")).toBe(true);
  });

  it("finds Pokémon when searching Pokemon", () => {
    expect(matchesArchiveSearch(pokemon, "Pokemon")).toBe(true);
  });

  it("finds Pokemon when searching Pokémon", () => {
    expect(matchesArchiveSearch(plain, "Pokémon")).toBe(true);
  });

  it("ignores case on accented text either way", () => {
    expect(matchesArchiveSearch(pokemon, "POKEMON")).toBe(true);
    expect(matchesArchiveSearch(pokemon, "POKÉMON")).toBe(true);
    expect(matchesArchiveSearch(plain, "pOkÉmOn")).toBe(true);
  });

  it("treats an old puzzle without a tags property as untagged", () => {
    const old = { id: "o", date: "2026-01-01", status: "published", themeTitle: "Cheese OR Font?", categoryA: "Cheese", categoryB: "Font" };
    expect(matchesArchiveSearch(old, "cheese font")).toBe(true);
    expect(matchesArchiveSearch(old, "food")).toBe(false);
  });
});

describe("archive topic filter", () => {
  // tags: a music+gaming, b music, c gaming+food, d untagged, e old (no tags property)
  const puzzles = [
    g("a", "2026-01-05", { themeTitle: "Video Game Composer or Pop Star?", tags: ["music", "gaming"] }),
    g("b", "2026-01-04", { themeTitle: "Opera or Pasta?", tags: ["music"] }),
    g("c", "2026-01-03", { themeTitle: "Mario Food or Real Food?", tags: ["gaming", "food"] }),
    g("d", "2026-01-02", { tags: [] }),
    { id: "e", date: "2026-01-01", status: "published", themeTitle: "Title e", categoryA: "Ae", categoryB: "Be" },
  ];
  const records = { a: { completed: true }, c: { completed: false, answers: [{}] } };
  const ids = (list) => list.map((p) => p.id);

  it("counts every used topic, in the topic list order", () => {
    expect(archiveTopicCounts(puzzles).map((t) => [t.id, t.count])).toEqual([
      ["music", 2],
      ["gaming", 2],
      ["food", 1],
    ]);
  });

  it("counts a multiply tagged puzzle once under each of its topics", () => {
    const counts = archiveTopicCounts([puzzles[0]]);
    expect(counts.map((t) => [t.id, t.count])).toEqual([["music", 1], ["gaming", 1]]);
    // so the topic totals can exceed the number of puzzles
    expect(archiveTopicCounts(puzzles).reduce((n, t) => n + t.count, 0)).toBe(5);
  });

  it("omits topics no puzzle uses", () => {
    const used = archiveTopicCounts(puzzles).map((t) => t.id);
    expect(used).not.toContain("sports");
    expect(used).toHaveLength(3);
    expect(archiveTopicCounts([puzzles[3], puzzles[4]])).toEqual([]);
  });

  it("gives labels and emoji for the menu", () => {
    expect(archiveTopicCounts(puzzles)[0]).toMatchObject({ id: "music", label: "Music", emoji: "🎵", count: 2 });
  });

  it("All topics covers the whole Archive, so its total is the puzzle count", () => {
    const { puzzles: list } = archivePuzzles(puzzles, {}, "2026-01-05");
    expect(filterArchive(list, {}, { topic: "all" })).toHaveLength(puzzles.length);
  });

  it("selecting a topic returns only puzzles carrying it", () => {
    expect(ids(filterArchive(puzzles, records, { topic: "music" }))).toEqual(["a", "b"]);
    expect(ids(filterArchive(puzzles, records, { topic: "food" }))).toEqual(["c"]);
  });

  it("combines the topic with search", () => {
    expect(ids(filterArchive(puzzles, records, { topic: "music", query: "pasta" }))).toEqual(["b"]);
    expect(ids(filterArchive(puzzles, records, { topic: "gaming", query: "food" }))).toEqual(["c"]);
    expect(ids(filterArchive(puzzles, records, { topic: "food", query: "opera" }))).toEqual([]);
  });

  it("combines the topic with All / Unplayed / Completed", () => {
    expect(ids(filterArchive(puzzles, records, { topic: "gaming", filter: "all" }))).toEqual(["a", "c"]);
    expect(ids(filterArchive(puzzles, records, { topic: "gaming", filter: "completed" }))).toEqual(["a"]);
    expect(ids(filterArchive(puzzles, records, { topic: "gaming", filter: "unplayed" }))).toEqual(["c"]);
    expect(ids(filterArchive(puzzles, records, { topic: "music", filter: "unplayed", query: "opera" }))).toEqual(["b"]);
  });

  it("clearing the topic restores every qualifying puzzle", () => {
    const narrowed = filterArchive(puzzles, records, { topic: "food" });
    expect(narrowed).toHaveLength(1);
    expect(ids(filterArchive(puzzles, records, { topic: "all" }))).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids(filterArchive(puzzles, records))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps old puzzles with no tags visible under All topics only", () => {
    expect(ids(filterArchive(puzzles, records, { topic: "all" }))).toContain("e");
    expect(ids(filterArchive(puzzles, records, { topic: "music" }))).not.toContain("e");
  });

  it("topic counts ignore search and filters, because they come from the whole Archive", () => {
    const before = archiveTopicCounts(puzzles);
    filterArchive(puzzles, records, { topic: "music", query: "pasta", filter: "unplayed" });
    expect(archiveTopicCounts(puzzles)).toEqual(before);
  });
});
