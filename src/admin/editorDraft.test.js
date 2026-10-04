import { describe, expect, it } from "vitest";
import { normalizeEditorDraft, restoreEditorDraft } from "./editorDraft.js";
import { gameToRow, rowToGame } from "../gameRow.js";

const ROW = {
  id: "g-1", date: "2026-10-10", theme_title: "Opera or Pasta?", category_a: "Opera", category_b: "Pasta",
  category_a_color: "teal", category_b_color: "pink", category_a_image: null, category_b_image: null,
  header_image: null, category_a_share_name: null, category_b_share_name: null,
  status: "draft", questions: [], tags: ["food"],
};
// What saveEditorDraft writes and loadEditorDraft reads back.
const storeAndRead = (game) => JSON.parse(JSON.stringify({ savedAt: 1, game: normalizeEditorDraft(game) }));

describe("Admin draft copy keeps topic tags", () => {
  it("a brand-new draft keeps its tags through the device copy and into the save", () => {
    const fresh = { id: "g-new", date: "", themeTitle: "", categoryA: "", categoryB: "", status: "draft", questions: [], tags: [] };
    const edited = { ...fresh, tags: ["music", "gaming"] };
    const reopened = restoreEditorDraft(fresh, storeAndRead(edited));
    expect(reopened.tags).toEqual(["music", "gaming"]);
    expect(gameToRow(reopened).tags).toEqual(["music", "gaming"]);
  });

  it("an existing puzzle reopens with its saved tags, and draft edits win", () => {
    const loaded = rowToGame(ROW);
    expect(restoreEditorDraft(loaded, null).tags).toEqual(["food"]);
    const reopened = restoreEditorDraft(loaded, storeAndRead({ ...loaded, tags: ["food", "theatre"] }));
    expect(reopened.tags).toEqual(["food", "theatre"]);
  });

  it("removing every tag in a draft stays removed after reopening", () => {
    const loaded = rowToGame(ROW);
    const reopened = restoreEditorDraft(loaded, storeAndRead({ ...loaded, tags: [] }));
    expect(reopened.tags).toEqual([]);
    expect(gameToRow(reopened)).toHaveProperty("tags", []);
  });

  it("a draft copy saved before topics existed keeps the puzzle's tags", () => {
    const loaded = rowToGame(ROW);
    const oldCopy = { savedAt: 1, game: { id: "g-1", themeTitle: "Edited", status: "draft", questions: [] } };
    const reopened = restoreEditorDraft(loaded, oldCopy);
    expect(reopened.themeTitle).toBe("Edited");
    expect(reopened.tags).toEqual(["food"]);
  });

  it("the database flags come from the loaded puzzle, never the draft", () => {
    const loaded = rowToGame(ROW);
    const reopened = restoreEditorDraft(loaded, { game: { ...loaded, tagsColumn: false } });
    expect(reopened.tagsColumn).toBe(true);
  });

  it("an old puzzle with no tags normalizes to an empty list", () => {
    expect(normalizeEditorDraft({ id: "x", status: "published" }).tags).toEqual([]);
  });

  it("publishing keeps the tags", () => {
    const loaded = rowToGame(ROW);
    const published = rowToGame(gameToRow({ ...restoreEditorDraft(loaded, null), status: "published" }));
    expect(published.tags).toEqual(["food"]);
    expect(published.status).toBe("published");
  });
});
