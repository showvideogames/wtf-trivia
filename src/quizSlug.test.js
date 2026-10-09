import { describe, expect, it } from "vitest";
import {
  SLUG_MAX, baseSlug, isQuizSlug, plannedQuizSlug, quizPath, quizSlugFromPath, quizUrl,
  resolveQuizSlugs, slugifyTitle, uniqueSlug,
} from "./quizSlug.js";

// Public quiz links (/quiz/<slug>): the slug rules, duplicates, stored vs
// derived slugs, and reading the address. tests/db/quiz-slugs.test.mjs
// checks the database's backfill and trigger make the very same slugs.

describe("slugifyTitle", () => {
  it("turns the matchup title into lowercase words joined by hyphens", () => {
    expect(slugifyTitle("Taylor Swift Song OR Skyrim City?")).toBe("taylor-swift-song-or-skyrim-city");
    expect(slugifyTitle("Board Game or Nicolas Cage Movie?")).toBe("board-game-or-nicolas-cage-movie");
  });

  it("removes punctuation, collapses repeated hyphens and trims both ends", () => {
    expect(slugifyTitle("  --Hello!!!   World--  ")).toBe("hello-world");
    expect(slugifyTitle("Muppet / Rapper: Who?! (Vol. 2)")).toBe("muppet-rapper-who-vol-2");
    expect(slugifyTitle("Best-Selling Self-Help Book OR AI-Made-Up One?")).toBe("best-selling-self-help-book-or-ai-made-up-one");
    expect(slugifyTitle("a---b___c...d")).toBe("a-b-c-d");
  });

  it("drops apostrophes, reads & as and, and keeps accented letters' base letter", () => {
    expect(slugifyTitle("Swift's Era or Swift’s Song")).toBe("swifts-era-or-swifts-song");
    expect(slugifyTitle("Cats & Dogs")).toBe("cats-and-dogs");
    expect(slugifyTitle("Pokémon OR Tolkien Élf?")).toBe("pokemon-or-tolkien-elf");
    expect(slugifyTitle("Crème Brûlée")).toBe("creme-brulee");
  });

  it("keeps emoji and other symbols out", () => {
    expect(slugifyTitle("🎲 Board Game 🎬 Movie")).toBe("board-game-movie");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugifyTitle(`${"word ".repeat(40)}end`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slug.endsWith("-")).toBe(false);
    expect(isQuizSlug(slug)).toBe(true);
  });

  it("gives nothing for a title with nothing usable; the quiz is then just \"quiz\"", () => {
    expect(slugifyTitle("")).toBe("");
    expect(slugifyTitle("?!?")).toBe("");
    expect(slugifyTitle(null)).toBe("");
    expect(baseSlug({ themeTitle: "???" })).toBe("quiz");
  });

  it("never uses a timestamp or the id", () => {
    expect(baseSlug({ id: "g-1776056769960", themeTitle: "Taylor Swift Song OR Skyrim City?" })).toBe("taylor-swift-song-or-skyrim-city");
  });
});

describe("uniqueSlug", () => {
  it("adds -2, -3, ... only when the name is taken", () => {
    expect(uniqueSlug("cats", new Set())).toBe("cats");
    expect(uniqueSlug("cats", new Set(["cats"]))).toBe("cats-2");
    expect(uniqueSlug("cats", new Set(["cats", "cats-2"]))).toBe("cats-3");
  });
});

describe("resolveQuizSlugs", () => {
  const quiz = (id, date, themeTitle, extra = {}) => ({ id, date, themeTitle, status: "published", ...extra });

  it("gives two quizzes with the same title distinct slugs, the earlier one the plain name", () => {
    const slugs = resolveQuizSlugs([
      quiz("g-2", "2026-10-02", "Taylor Swift Song OR Skyrim City?"),
      quiz("g-1", "2026-10-01", "Taylor Swift Song OR Skyrim City?"),
      quiz("g-3", "2026-10-03", "Taylor Swift Song or Skyrim City"),
    ]);
    expect(slugs.get("g-1")).toBe("taylor-swift-song-or-skyrim-city");
    expect(slugs.get("g-2")).toBe("taylor-swift-song-or-skyrim-city-2");
    expect(slugs.get("g-3")).toBe("taylor-swift-song-or-skyrim-city-3");
  });

  it("keeps an existing quiz's stored slug, whatever its title says now", () => {
    const slugs = resolveQuizSlugs([quiz("g-1", "2026-10-01", "A Renamed Title", { slug: "the-original-name" })]);
    expect(slugs.get("g-1")).toBe("the-original-name");
  });

  it("derives a legacy quiz's slug (no stored one) from its title, around the stored ones", () => {
    const slugs = resolveQuizSlugs([
      quiz("g-new", "2026-10-05", "Cats or Dogs?", { slug: "cats-or-dogs" }),
      quiz("g-old", "2026-09-01", "Cats or Dogs?"),
    ]);
    expect(slugs.get("g-new")).toBe("cats-or-dogs");
    expect(slugs.get("g-old")).toBe("cats-or-dogs-2");
  });

  it("names published quizzes first, so a draft can never take a published quiz's link", () => {
    const slugs = resolveQuizSlugs([
      quiz("g-draft", "", "Cats or Dogs?", { status: "draft" }),
      quiz("g-pub", "2026-10-01", "Cats or Dogs?"),
    ]);
    expect(slugs.get("g-pub")).toBe("cats-or-dogs");
    expect(slugs.get("g-draft")).toBe("cats-or-dogs-2");
  });

  it("is the same whatever order the list arrives in", () => {
    const list = [quiz("b", "2026-10-01", "X"), quiz("a", "2026-10-01", "X"), quiz("c", "2026-09-01", "X")];
    const one = resolveQuizSlugs(list);
    const two = resolveQuizSlugs([...list].reverse());
    expect([...one].sort()).toEqual([...two].sort());
    expect(one.get("c")).toBe("x");
    expect(one.get("a")).toBe("x-2");
    expect(one.get("b")).toBe("x-3");
  });

  it("ignores a stored value that isn't a usable slug", () => {
    expect(resolveQuizSlugs([quiz("g-1", "2026-10-01", "Cats", { slug: "Not A Slug!" })]).get("g-1")).toBe("cats");
  });
});

describe("plannedQuizSlug", () => {
  const games = [{ id: "g-1", date: "2026-10-01", status: "published", themeTitle: "Cats", slug: "cats", slugColumn: true }];
  it("is the title made unique against every other quiz", () => {
    expect(plannedQuizSlug({ id: "g-2", themeTitle: "Cats", status: "draft", slugColumn: true }, games)).toBe("cats-2");
    expect(plannedQuizSlug({ id: "g-2", themeTitle: "Dogs", status: "draft", slugColumn: true }, games)).toBe("dogs");
  });
  it("before the database has slugs, is the derived one", () => {
    const legacy = [{ id: "g-1", date: "2026-10-01", status: "published", themeTitle: "Cats" }];
    expect(plannedQuizSlug({ id: "g-2", date: "2026-10-02", status: "published", themeTitle: "Cats" }, legacy)).toBe("cats-2");
  });
});

describe("quiz addresses", () => {
  it("builds the path and the public URL", () => {
    expect(quizPath("taylor-swift-song-or-skyrim-city")).toBe("/quiz/taylor-swift-song-or-skyrim-city");
    expect(quizUrl("cats")).toBe("https://whatthefudge.gg/quiz/cats");
  });

  it("reads a slug from /quiz/<slug>, in any case, with or without a trailing slash", () => {
    expect(quizSlugFromPath("/quiz/cats-or-dogs")).toBe("cats-or-dogs");
    expect(quizSlugFromPath("/quiz/cats-or-dogs/")).toBe("cats-or-dogs");
    expect(quizSlugFromPath("/quiz/Cats-Or-Dogs")).toBe("cats-or-dogs");
  });

  it("gives \"\" for a quiz link that can't be a slug, and null for other addresses", () => {
    expect(quizSlugFromPath("/quiz/")).toBe("");
    expect(quizSlugFromPath("/quiz/not_valid!")).toBe("");
    expect(quizSlugFromPath("/quiz/a--b")).toBe("");
    expect(quizSlugFromPath("/quiz/%E0%A4%A")).toBe("");
    expect(quizSlugFromPath("/quiz/a/b")).toBeNull();
    expect(quizSlugFromPath("/puzzle/g-1")).toBeNull();
    expect(quizSlugFromPath("/")).toBeNull();
  });
});
