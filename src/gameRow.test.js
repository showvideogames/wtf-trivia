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
