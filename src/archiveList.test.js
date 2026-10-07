import { describe, expect, it } from "vitest";
import {
  MIN_RANKED_PLAYS,
  archivePuzzles,
  archiveTopicCounts,
  filterArchive,
  matchesArchiveSearch,
  puzzleAccuracy,
  sortArchive,
} from "./archiveList.js";

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

  it("never lists a published puzzle scheduled after today, until its day comes", () => {
    const withFuture = [...games, g("tomorrow", "2026-10-04"), g("next-week", "2026-10-10")];
    const ids = (today) => archivePuzzles(withFuture, records, today).puzzles.map((p) => p.id);
    expect(ids("2026-10-03")).toEqual(["today", "mid", "retired-played", "old"]);
    // At local midnight the next day's puzzle becomes today's and leads the list.
    expect(ids("2026-10-04")).toEqual(["tomorrow", "today", "mid", "retired-played", "old"]);
    expect(archivePuzzles(withFuture, records, "2026-10-04").todayGame.id).toBe("tomorrow");
    // Topic counts and filters only ever see what was listed.
    expect(archiveTopicCounts(archivePuzzles(withFuture, records, "2026-10-03").puzzles).reduce((n, t) => n + t.count, 0))
      .toBe(archiveTopicCounts(archivePuzzles(games, records, "2026-10-03").puzzles).reduce((n, t) => n + t.count, 0));
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

describe("Favorites filter", () => {
  const puzzles = [
    g("a", "2026-01-05", { themeTitle: "Opera or Pasta?", tags: ["music", "food"] }),
    g("b", "2026-01-04", { themeTitle: "Pokémon or Planet?", tags: ["gaming"] }),
    g("c", "2026-01-03", { themeTitle: "Puppet or Singer?", tags: ["music"] }),
    g("d", "2026-01-02", { themeTitle: "Cheese or Font?", tags: ["food"] }),
  ];
  const records = { a: { completed: true }, c: { completed: true } };
  const favorites = new Set(["a", "b", "d"]);
  const ids = (list) => list.map((p) => p.id);

  it("shows only this player's favorites", () => {
    expect(ids(filterArchive(puzzles, records, { filter: "favorites", favorites }))).toEqual(["a", "b", "d"]);
  });

  it("combines with a topic: Favorites + Music", () => {
    expect(ids(filterArchive(puzzles, records, { filter: "favorites", favorites, topic: "music" }))).toEqual(["a"]);
  });

  it("combines with search, accents included", () => {
    expect(ids(filterArchive(puzzles, records, { filter: "favorites", favorites, query: "pokemon" }))).toEqual(["b"]);
    expect(ids(filterArchive(puzzles, records, { filter: "favorites", favorites, query: "puppet" }))).toEqual([]);
  });

  it("combines with topic and search together", () => {
    expect(ids(filterArchive(puzzles, records, { filter: "favorites", favorites, topic: "food", query: "cheese" }))).toEqual(["d"]);
  });

  it("shows nothing (never everything) when favorites aren't known", () => {
    expect(filterArchive(puzzles, records, { filter: "favorites", favorites: null })).toEqual([]);
  });

  it("leaves Completed + topic as it was", () => {
    expect(ids(filterArchive(puzzles, records, { filter: "completed", topic: "music", favorites }))).toEqual(["a", "c"]);
  });
});

describe("puzzleAccuracy", () => {
  const s = (totalFinished, totalScore, totalQuestions) => ({ totalFinished, totalScore, totalQuestions });

  it("is total_score / (total_finished × total_questions)", () => {
    expect(puzzleAccuracy(s(10, 30, 8))).toBe(0.375);
    expect(puzzleAccuracy(s(20, 70, 5))).toBe(0.7);
  });

  it(`needs at least ${MIN_RANKED_PLAYS} finished plays`, () => {
    expect(MIN_RANKED_PLAYS).toBe(5);
    expect(puzzleAccuracy(s(4, 16, 5))).toBeNull();
    expect(puzzleAccuracy(s(5, 20, 5))).toBe(0.8);
  });

  it("treats missing, zero, inconsistent or invalid stats as unranked", () => {
    expect(puzzleAccuracy(undefined)).toBeNull();
    expect(puzzleAccuracy({})).toBeNull();
    expect(puzzleAccuracy(s(0, 0, 0))).toBeNull();
    expect(puzzleAccuracy(s(10, 30, 0))).toBeNull();
    expect(puzzleAccuracy(s(10, 81, 8))).toBeNull(); // more than 10 × 8 possible
    expect(puzzleAccuracy(s(10, -1, 8))).toBeNull();
    expect(puzzleAccuracy(s(10, null, 8))).toBeNull();
    expect(puzzleAccuracy(s(10, "", 8))).toBeNull();
    expect(puzzleAccuracy(s(10, "abc", 8))).toBeNull();
    expect(puzzleAccuracy(s(10.5, 30, 8))).toBeNull();
    expect(puzzleAccuracy(s(Infinity, 30, 8))).toBeNull();
  });

  it("accepts numeric strings from the database", () => {
    expect(puzzleAccuracy(s("10", "40", "8"))).toBe(0.5);
  });
});

describe("sortArchive", () => {
  const ids = (list) => list.map((p) => p.id);

  describe("Newest and Oldest", () => {
    const puzzles = [
      g("mid", "2026-02-01"),
      g("old", "2026-01-01"),
      g("tie-b", "2026-03-01", { themeTitle: "Banana" }),
      g("tie-a", "2026-03-01", { themeTitle: "apple" }),
      g("new", "2026-04-01"),
    ];

    it("Newest first by date, ties by title then id (default)", () => {
      expect(ids(sortArchive(puzzles))).toEqual(["new", "tie-a", "tie-b", "mid", "old"]);
      expect(ids(sortArchive(puzzles, "newest"))).toEqual(["new", "tie-a", "tie-b", "mid", "old"]);
    });

    it("Oldest first by date, same tie order", () => {
      expect(ids(sortArchive(puzzles, "oldest"))).toEqual(["old", "mid", "tie-a", "tie-b", "new"]);
    });

    it("is deterministic whatever order the puzzles arrive in", () => {
      const shuffled = [puzzles[3], puzzles[0], puzzles[4], puzzles[2], puzzles[1]];
      expect(ids(sortArchive(shuffled, "newest"))).toEqual(ids(sortArchive(puzzles, "newest")));
      expect(ids(sortArchive(shuffled, "oldest"))).toEqual(ids(sortArchive(puzzles, "oldest")));
    });

    it("Newest keeps today's puzzle first, as the Archive always has", () => {
      const today = g("today", "2026-03-15");
      const list = [...puzzles, today];
      expect(ids(sortArchive(list, "newest", { todayGame: today }))[0]).toBe("today");
      expect(ids(sortArchive(list, "oldest", { todayGame: today }))).toEqual(["old", "mid", "tie-a", "tie-b", "today", "new"]);
    });

    it("never changes the list it was given", () => {
      const copy = [...puzzles];
      sortArchive(puzzles, "oldest");
      expect(puzzles).toEqual(copy);
    });
  });

  describe("Hardest and Easiest", () => {
    // Raw average scores would rank these the other way round: "long" has
    // the higher average (4 of 10) but the lower accuracy (40%) than
    // "short" (3 of 5 = 60%).
    const puzzles = [
      g("short", "2026-01-05"),
      g("long", "2026-01-04"),
      g("few", "2026-01-03"),
      g("none", "2026-01-02"),
      g("bad", "2026-01-01"),
      g("tie-new", "2026-01-07"),
      g("tie-old", "2026-01-06"),
    ];
    const stats = {
      short: { totalFinished: 10, totalScore: 30, totalQuestions: 5 }, // 60%
      long: { totalFinished: 10, totalScore: 40, totalQuestions: 10 }, // 40%
      few: { totalFinished: 4, totalScore: 0, totalQuestions: 5 }, // too few
      bad: { totalFinished: 6, totalScore: 99, totalQuestions: 5 }, // impossible
      "tie-new": { totalFinished: 5, totalScore: 15, totalQuestions: 5 }, // 60%
      "tie-old": { totalFinished: 20, totalScore: 120, totalQuestions: 10 }, // 60%
    };

    it("Hardest: lowest average percentage correct first", () => {
      expect(ids(sortArchive(puzzles, "hardest", { stats }))).toEqual(["long", "tie-new", "tie-old", "short", "few", "none", "bad"]);
    });

    it("Easiest: highest average percentage correct first", () => {
      expect(ids(sortArchive(puzzles, "easiest", { stats }))).toEqual(["tie-new", "tie-old", "short", "long", "few", "none", "bad"]);
    });

    it("puts unranked puzzles (too few plays, missing or invalid stats) last in both, newest first", () => {
      for (const sort of ["hardest", "easiest"]) {
        expect(ids(sortArchive(puzzles, sort, { stats })).slice(-3)).toEqual(["few", "none", "bad"]);
      }
    });

    it("a puzzle reaching 5 finished plays joins the ranking", () => {
      const fifth = { ...stats, few: { totalFinished: 5, totalScore: 0, totalQuestions: 5 } };
      expect(ids(sortArchive(puzzles, "hardest", { stats: fifth }))[0]).toBe("few");
    });

    it("falls back to Newest when the stats didn't load", () => {
      expect(ids(sortArchive(puzzles, "hardest", { stats: null }))).toEqual(ids(sortArchive(puzzles, "newest")));
    });
  });

  describe("Most liked", () => {
    const puzzles = [g("a", "2026-01-01"), g("b", "2026-01-02"), g("c", "2026-01-03"), g("d", "2026-01-04"), g("e", "2026-01-05")];

    it("most favorites first, newest first among equals, zero-favorite puzzles kept after", () => {
      const favoriteCounts = { a: 3, b: 7, c: 3, e: 0 };
      expect(ids(sortArchive(puzzles, "liked", { favoriteCounts }))).toEqual(["b", "c", "a", "e", "d"]);
    });

    it("ignores nonsense counts", () => {
      const favoriteCounts = { a: "x", b: -2, c: 1 };
      expect(ids(sortArchive(puzzles, "liked", { favoriteCounts }))).toEqual(["c", "e", "d", "b", "a"]);
    });

    it("falls back to Newest when counts didn't load", () => {
      expect(ids(sortArchive(puzzles, "liked", { favoriteCounts: null }))).toEqual(["e", "d", "c", "b", "a"]);
    });
  });

  it("sorting never changes the topic counts", () => {
    const puzzles = [g("a", "2026-01-01", { tags: ["music"] }), g("b", "2026-01-02", { tags: ["music", "food"] })];
    const before = archiveTopicCounts(puzzles);
    for (const sort of ["oldest", "hardest", "easiest", "liked"]) {
      archiveTopicCounts(sortArchive(puzzles, sort, { stats: {}, favoriteCounts: { a: 1 } }));
      expect(archiveTopicCounts(puzzles)).toEqual(before);
    }
  });
});
