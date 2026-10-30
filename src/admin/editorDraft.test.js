import { describe, expect, it } from "vitest";
import { editorSnapshot, hasDeviceEdits, normalizeEditorDraft, restoreEditorDraft } from "./editorDraft.js";
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

describe("Admin draft copy keeps the wide artwork", () => {
  const WIDE = "https://example.supabase.co/storage/v1/object/public/wtf-images/wide/w.webp";
  const SQUARE = "https://example.supabase.co/storage/v1/object/public/wtf-images/headers/p.webp";

  it("a draft's wide artwork survives the device copy, separately from the square poster", () => {
    const loaded = rowToGame({ ...ROW, header_image: SQUARE });
    const reopened = restoreEditorDraft(loaded, storeAndRead({ ...loaded, wideImage: WIDE }));
    expect(reopened.wideImage).toBe(WIDE);
    expect(reopened.headerImage).toBe(SQUARE);
    expect(gameToRow(reopened)).toMatchObject({ wide_image: WIDE, header_image: SQUARE });
  });

  it("removing it in a draft stays removed; a draft from before wide artwork keeps the puzzle's", () => {
    const loaded = rowToGame({ ...ROW, wide_image: WIDE });
    expect(restoreEditorDraft(loaded, storeAndRead({ ...loaded, wideImage: "" })).wideImage).toBe("");
    const { wideImage: _drop, ...older } = loaded;
    expect(restoreEditorDraft(loaded, storeAndRead(older)).wideImage).toBe(WIDE);
  });

  it("the database flag comes from the loaded puzzle, not the draft", () => {
    const loaded = rowToGame(ROW);
    const reopened = restoreEditorDraft(loaded, storeAndRead({ ...loaded, wideImageColumn: true }));
    expect(reopened.wideImageColumn).toBe(false);
  });
});

describe("editorSnapshot", () => {
  it("treats blank fields alike and ignores key order, strictly by default", () => {
    expect(editorSnapshot({ id: "x", themeTitle: "", slug: null, tags: [] })).toBe(editorSnapshot({ tags: [], id: "x" }));
    expect(editorSnapshot({ id: "x", themeTitle: "Opera " })).not.toBe(editorSnapshot({ id: "x", themeTitle: "Opera" }));
  });

  it("ignores spaces around strings only when asked, at any depth", () => {
    const a = { id: "x", categoryAShareName: "  ", questions: [{ itemText: " Espresso " }] };
    const b = { id: "x", questions: [{ itemText: "Espresso" }] };
    expect(editorSnapshot(a, { trim: true })).toBe(editorSnapshot(b, { trim: true }));
    expect(editorSnapshot(a)).not.toBe(editorSnapshot(b));
    expect(editorSnapshot({ ...a, themeTitle: "Opera" }, { trim: true })).not.toBe(editorSnapshot(b, { trim: true }));
  });
});

describe("hasDeviceEdits", () => {
  const stored = rowToGame(ROW);

  it("is false for a copy that matches, as every open draft keeps one", () => {
    expect(hasDeviceEdits(stored, storeAndRead(stored))).toBe(false);
  });

  it("is true for a copy that differs, on a draft or a retired puzzle", () => {
    expect(hasDeviceEdits(stored, storeAndRead({ ...stored, themeTitle: "Edited" }))).toBe(true);
    const retired = { ...stored, status: "retired" };
    expect(hasDeviceEdits(retired, storeAndRead({ ...retired, themeTitle: "Edited" }))).toBe(true);
  });

  it("is false for a published puzzle, whatever the device holds", () => {
    const live = { ...stored, status: "published" };
    expect(hasDeviceEdits(live, storeAndRead({ ...live, themeTitle: "Edited" }))).toBe(false);
  });

  it("is false after a save that only trimmed: the row is trimmed, the device copy isn't", () => {
    const typed = { ...stored, categoryAShareName: " Stage ", categoryBSubtitle: "Sauce ", wideImage: " https://x.example/w.webp " };
    const saved = rowToGame(gameToRow(typed));
    const copy = storeAndRead(typed);
    expect(saved.categoryAShareName).toBe("Stage");
    expect(hasDeviceEdits(saved, copy)).toBe(false);
    // The editor's own Unsaved changes check stays strict.
    expect(editorSnapshot(restoreEditorDraft(saved, copy))).not.toBe(editorSnapshot(saved));
  });

  it("is false for a missing or unreadable copy", () => {
    for (const copy of [null, undefined, "", "x", 5, {}, { game: null }, { game: "x" }, { game: 5 }, { game: ["x"] }])
      expect(hasDeviceEdits(stored, copy)).toBe(false);
  });
});
