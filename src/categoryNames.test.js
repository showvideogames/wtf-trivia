import { describe, expect, it } from "vitest";
import { answerButtonName } from "./categoryNames.js";
import { gameToRow, rowToGame } from "./gameRow.js";
import { buildResultsShareText } from "./share.js";
import { puzzleMeta } from "./puzzleMeta.js";
import { normalizeEditorDraft, restoreEditorDraft } from "./admin/editorDraft.js";
import { swatchOrder } from "./admin/StudioContext.js";

// A puzzle saved before any display-name columns existed.
const OLD_ROW = {
  id: "g-1", date: "2026-10-10", theme_title: "Led Zeppelin OR My Little Pony Song?",
  category_a: "Led Zeppelin", category_b: "My Little Pony",
  category_a_color: "teal", category_b_color: "pink", category_a_image: null, category_b_image: null,
  header_image: null, status: "published",
  questions: [{ itemText: "Kashmir", correctCategory: "A" }, { itemText: "Smile", correctCategory: "B" }],
};
// The same puzzle on a database that has run category_display_names.sql.
const MIGRATED_ROW = {
  ...OLD_ROW,
  category_a_share_name: null, category_b_share_name: null,
  category_a_subtitle: null, category_b_subtitle: null,
  category_a_button_name: null, category_b_button_name: null,
};
const RECORD = { score: 1, totalQuestions: 2, answers: [{ correct: true }, { correct: false }] };
// What saveEditorDraft writes and loadEditorDraft reads back.
const storeAndRead = (game) => JSON.parse(JSON.stringify({ savedAt: 1, game: normalizeEditorDraft(game) }));

describe("category display names", () => {
  it("loads an old puzzle with its category name on the banner and buttons, and saves it unchanged", () => {
    const game = rowToGame(OLD_ROW);
    expect(game.categoryA).toBe("Led Zeppelin");
    expect(answerButtonName(game, "A")).toBe("Led Zeppelin");
    expect(answerButtonName(game, "B")).toBe("My Little Pony");
    expect(game.categoryAButtonName).toBe("");
    expect(game.buttonNameColumns).toBe(false);
    // Loading alone never adds columns the old row didn't have.
    expect(Object.keys(gameToRow(game)).sort()).toEqual(Object.keys(OLD_ROW).sort());
  });

  it("keeps an existing share override, and a blank one still falls back to the category name", () => {
    const game = rowToGame({ ...MIGRATED_ROW, category_a_share_name: "Led Zeppelin 🎸🤘" });
    // Share names now name the categories in the puzzle link's preview.
    expect(puzzleMeta(game).description).toMatch(/^Led Zeppelin 🎸🤘 or My Little Pony\? /);
    expect(gameToRow(game).category_a_share_name).toBe("Led Zeppelin 🎸🤘");
  });

  it("edits each name independently", () => {
    const base = rowToGame(MIGRATED_ROW);
    const edited = { ...base, categoryAButtonName: "Zeppelin" };
    expect(edited.categoryA).toBe("Led Zeppelin");
    expect(answerButtonName(edited, "A")).toBe("Zeppelin");
    expect(puzzleMeta(edited).description).toMatch(/^Led Zeppelin or My Little Pony\? /);
    // The share text itself names no category: the circles, score and link.
    expect(buildResultsShareText({ game: edited, record: RECORD })).toBe("🟢🔴\n1/2 ➜ Can you beat my score?!\nhttps://whatthefudge.gg/puzzle/g-1");

    const renamed = { ...edited, categoryA: "Led Zep" };
    expect(answerButtonName(renamed, "A")).toBe("Zeppelin");
    const row = gameToRow({ ...renamed, categoryAShareName: "Led Zeppelin 🎸🤘", categoryASubtitle: "Song" });
    expect(row).toMatchObject({
      category_a: "Led Zep", category_a_subtitle: "Song",
      category_a_button_name: "Zeppelin", category_a_share_name: "Led Zeppelin 🎸🤘",
    });
  });

  it("falls back to the matchup name when the button name is blank or whitespace", () => {
    const game = { ...rowToGame(MIGRATED_ROW), categoryAButtonName: "   " };
    expect(answerButtonName(game, "A")).toBe("Led Zeppelin");
    expect(gameToRow(game).category_a_button_name).toBeNull();
  });

  it("saves a one-sided subtitle on either side, with no punctuation or words added", () => {
    const base = rowToGame(MIGRATED_ROW);
    expect(gameToRow({ ...base, categoryASubtitle: "Song" })).toMatchObject({ category_a_subtitle: "Song", category_b_subtitle: null });
    expect(gameToRow({ ...base, categoryBSubtitle: " Song " })).toMatchObject({ category_a_subtitle: null, category_b_subtitle: "Song" });
    expect(gameToRow(base)).toMatchObject({ category_a_subtitle: null, category_b_subtitle: null });
  });

  it("names never touch answers", () => {
    const game = { ...rowToGame(MIGRATED_ROW), categoryA: "X", categoryAButtonName: "Y", categoryAShareName: "Z" };
    expect(gameToRow(game).questions).toEqual(OLD_ROW.questions);
  });

  it("only sends the button columns when needed, so old databases save as before", () => {
    const old = rowToGame(OLD_ROW);
    expect("category_a_button_name" in gameToRow(old)).toBe(false);
    expect(gameToRow({ ...old, categoryBButtonName: "Pony" })).toMatchObject({ category_a_button_name: null, category_b_button_name: "Pony" });
    // Once loaded from a migrated database, clearing a name saves null.
    const migrated = rowToGame({ ...MIGRATED_ROW, category_a_button_name: "Zeppelin" });
    expect(gameToRow({ ...migrated, categoryAButtonName: "" })).toMatchObject({ category_a_button_name: null, category_b_button_name: null });
  });

  it("every name survives the device draft copy, Save draft, reopening and Publish changes", () => {
    const fresh = { id: "g-new", date: "", themeTitle: "", categoryA: "", categoryB: "", status: "draft", questions: [], tags: [] };
    const typed = {
      ...fresh, themeTitle: "Led Zeppelin OR My Little Pony Song?",
      categoryA: "Led Zeppelin", categoryASubtitle: "Song", categoryAButtonName: "Led Zeppelin", categoryAShareName: "Led Zeppelin 🎸🤘",
      categoryB: "My Little Pony", categoryBSubtitle: "", categoryBButtonName: "MLP", categoryBShareName: "",
    };
    // Local draft recovery.
    const recovered = restoreEditorDraft(fresh, storeAndRead(typed));
    // Save draft, then reopen from the saved row (the database echoes it back).
    const reopened = rowToGame({ ...MIGRATED_ROW, ...gameToRow(recovered) });
    expect(reopened).toMatchObject({
      categoryA: "Led Zeppelin", categoryASubtitle: "Song", categoryAButtonName: "Led Zeppelin", categoryAShareName: "Led Zeppelin 🎸🤘",
      categoryB: "My Little Pony", categoryBSubtitle: "", categoryBButtonName: "MLP", categoryBShareName: "",
    });
    // Publish changes: an edit to one name only.
    const published = rowToGame({ ...MIGRATED_ROW, ...gameToRow({ ...reopened, status: "published", categoryBSubtitle: "Song" }) });
    expect(published).toMatchObject({ categoryASubtitle: "Song", categoryBSubtitle: "Song", categoryBButtonName: "MLP", categoryAShareName: "Led Zeppelin 🎸🤘" });
  });

  it("a draft copy never overrides what the database supports", () => {
    const loaded = rowToGame(MIGRATED_ROW);
    const stale = { savedAt: 1, game: { ...normalizeEditorDraft(loaded), buttonNameColumns: false, categoryAButtonName: "" } };
    expect(restoreEditorDraft(loaded, stale).buttonNameColumns).toBe(true);
  });
});

describe("palette picker order", () => {
  const palette = [{ id: "teal" }, { id: "pink" }, { id: "red" }, { id: "extra" }];
  it("groups by family and never drops a colour", () => {
    const order = swatchOrder(palette, [{ name: "Reds", ids: ["red", "pink", "gone"] }, { name: "Greens", ids: ["teal", "red"] }]);
    expect(order.map((p) => p.id)).toEqual(["red", "pink", "teal", "extra"]);
  });
});
