import { describe, it, expect } from "vitest";
import { gameToRow, rowToGame } from "./gameRow.js";

// A row as the database returns it before supabase/share_names.sql runs.
const LEGACY_ROW = {
  id: "g-1", date: "2026-09-27", theme_title: "Board Game or Nicolas Cage Movie?",
  category_a: "Board Game", category_b: "Nicolas Cage Movie",
  category_a_color: "teal", category_b_color: "pink",
  category_a_image: null, category_b_image: null, header_image: null,
  status: "published", questions: [{ itemText: "Con Air", correctCategory: "B" }],
};
const MIGRATED_ROW = { ...LEGACY_ROW, category_a_share_name: null, category_b_share_name: null };

describe("share names in the games row", () => {
  it("loads a legacy row with blank share names", () => {
    const game = rowToGame(LEGACY_ROW);
    expect(game.categoryAShareName).toBe("");
    expect(game.categoryBShareName).toBe("");
    expect(game.shareNameColumns).toBe(false);
  });

  it("saves a legacy puzzle without the new columns, exactly as before", () => {
    const row = gameToRow({ ...rowToGame(LEGACY_ROW), themeTitle: "Edited" });
    expect(Object.keys(row).sort()).toEqual(Object.keys(LEGACY_ROW).sort());
    expect(row.theme_title).toBe("Edited");
  });

  it("treats whitespace-only share names as blank", () => {
    const row = gameToRow({ ...rowToGame(LEGACY_ROW), categoryAShareName: "   ", categoryBShareName: "" });
    expect("category_a_share_name" in row).toBe(false);
  });

  it("sends both columns once either share name is set, trimmed", () => {
    const row = gameToRow({ ...rowToGame(LEGACY_ROW), categoryBShareName: "  Pro Hockey Player? 🏒 " });
    expect(row.category_a_share_name).toBeNull();
    expect(row.category_b_share_name).toBe("Pro Hockey Player? 🏒");
  });

  it("round-trips share names through a migrated row", () => {
    const game = rowToGame({ ...MIGRATED_ROW, category_a_share_name: "Harry Potter Character 🧙‍♂️" });
    expect(game.categoryAShareName).toBe("Harry Potter Character 🧙‍♂️");
    expect(game.shareNameColumns).toBe(true);
    expect(gameToRow(game).category_a_share_name).toBe("Harry Potter Character 🧙‍♂️");
  });

  it("sends null to clear a name on a migrated database", () => {
    const game = rowToGame({ ...MIGRATED_ROW, category_a_share_name: "Harry Potter Character 🧙‍♂️" });
    const row = gameToRow({ ...game, categoryAShareName: "" });
    expect(row).toHaveProperty("category_a_share_name", null);
    expect(row).toHaveProperty("category_b_share_name", null);
  });

  it("never writes the internal shareNameColumns flag", () => {
    const row = gameToRow(rowToGame(MIGRATED_ROW));
    expect(row).not.toHaveProperty("shareNameColumns");
    expect(row).not.toHaveProperty("share_name_columns");
  });
});

// A row as the database returns it after supabase/puzzle_tags.sql runs.
const TAGGED_ROW = { ...MIGRATED_ROW, tags: [] };

describe("topic tags in the games row", () => {
  it("loads a row without a tags column (old database) as no tags", () => {
    const game = rowToGame(MIGRATED_ROW);
    expect(game.tags).toEqual([]);
    expect(game.tagsColumn).toBe(false);
  });

  it("saves an untagged puzzle without the tags column on an old database", () => {
    const row = gameToRow(rowToGame(MIGRATED_ROW));
    expect("tags" in row).toBe(false);
  });

  it("saves a new draft's tags", () => {
    const row = gameToRow({ id: "g-new", date: "2026-10-10", themeTitle: "", categoryA: "", categoryB: "", status: "draft", questions: [], tags: ["music", "gaming"] });
    expect(row.tags).toEqual(["music", "gaming"]);
  });

  it("round-trips several tags through save and load", () => {
    const game = { ...rowToGame(TAGGED_ROW), tags: ["toys", "music", "gaming"] };
    const row = gameToRow(game);
    expect(row.tags).toEqual(["music", "gaming", "toys"]);
    const reloaded = rowToGame(JSON.parse(JSON.stringify({ ...row, created_at: "x" })));
    expect(reloaded.tags).toEqual(["music", "gaming", "toys"]);
    expect(reloaded.tagsColumn).toBe(true);
  });

  it("keeps tags through a publish (status change) and a re-save", () => {
    const draft = rowToGame({ ...TAGGED_ROW, status: "draft", tags: ["food"] });
    const published = rowToGame(gameToRow({ ...draft, status: "published" }));
    expect(published.status).toBe("published");
    expect(gameToRow({ ...published, themeTitle: "Edited" }).tags).toEqual(["food"]);
  });

  it("survives the on-device draft copy (JSON in localStorage)", () => {
    const game = { ...rowToGame(TAGGED_ROW), tags: ["sports", "cars"] };
    const restored = JSON.parse(JSON.stringify(game));
    expect(gameToRow(restored).tags).toEqual(["sports", "cars"]);
  });

  it("saves [] when the last tag is removed on a migrated database", () => {
    const game = rowToGame({ ...TAGGED_ROW, tags: ["food"] });
    expect(gameToRow({ ...game, tags: [] })).toHaveProperty("tags", []);
  });

  it("never writes the internal tagsColumn flag or unknown ids", () => {
    const row = gameToRow({ ...rowToGame(TAGGED_ROW), tags: ["music", "made_up"] });
    expect(row).not.toHaveProperty("tagsColumn");
    expect(row.tags).toEqual(["music"]);
  });
});

describe("wide artwork in the games row", () => {
  const WIDE = "https://example.supabase.co/storage/v1/object/public/wtf-images/wide/w.webp";

  it("saves a puzzle without wide artwork exactly as before the migration", () => {
    const game = rowToGame(LEGACY_ROW);
    expect(game.wideImage).toBe("");
    expect(game.wideImageColumn).toBe(false);
    expect("wide_image" in gameToRow(game)).toBe(false);
  });

  it("sends wide_image once there is wide artwork, and round-trips it", () => {
    const row = gameToRow({ ...rowToGame(LEGACY_ROW), wideImage: ` ${WIDE} ` });
    expect(row.wide_image).toBe(WIDE);
    expect(row.header_image).toBeNull(); // the square poster is its own field
    const back = rowToGame(row);
    expect(back.wideImage).toBe(WIDE);
    expect(back.wideImageColumn).toBe(true);
  });

  it("sends null to remove it on a migrated database, and never the flag itself", () => {
    const game = rowToGame({ ...LEGACY_ROW, wide_image: WIDE });
    const row = gameToRow({ ...game, wideImage: "" });
    expect(row).toHaveProperty("wide_image", null);
    expect(row).not.toHaveProperty("wideImageColumn");
  });
});
