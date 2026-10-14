import { describe, it, expect } from "vitest";
import { PICTURE_ALT_FALLBACK, countPictures, descriptionNamesAnswer, firstMissingPicture, gameplayImageUrls, isPictureQuiz, pictureAlt, questionPicture } from "./pictureQuiz.js";
import { gameToRow, rowToGame } from "./gameRow.js";
import { restoreEditorDraft } from "./admin/editorDraft.js";
import { missingSummary, questionGaps } from "./admin/questionStatus.js";
import { archivePuzzleImages, currentImageUrl, imageName, listPuzzleImages } from "./admin/publishImages.js";
import { buildPuzzleExport } from "./admin/puzzleExport.js";

const PIC = "https://store.example.com/wtf-images/questions/1-abc.webp";
const REVEAL = "https://store.example.com/wtf-images/questions/2-def.webp";
const isYouTube = (u) => /youtu/.test(u || "");
const q = (over = {}) => ({ id: "q1", itemText: "Mr. Met", correctCategory: "A", flavorCopy: "f", explanationCopy: "e", imageUrl: "", ...over });

describe("picture quiz basics", () => {
  it("is off unless the quiz says exactly true", () => {
    expect(isPictureQuiz({})).toBe(false);
    expect(isPictureQuiz({ pictureQuiz: "true" })).toBe(false);
    expect(isPictureQuiz({ pictureQuiz: true })).toBe(true);
  });

  it("only counts a usable picture address", () => {
    expect(questionPicture(q({ questionImage: PIC }))).toBe(PIC);
    for (const bad of [undefined, null, "", "  ", "null", "javascript:alert(1)", 42]) expect(questionPicture(q({ questionImage: bad }))).toBe(null);
  });

  it("reads a neutral description, falling back to one that never names the answer", () => {
    expect(pictureAlt(q({ questionImageAlt: "  Cartoon baseball-head mascot " }))).toBe("Cartoon baseball-head mascot");
    expect(pictureAlt(q())).toBe(PICTURE_ALT_FALLBACK);
    expect(PICTURE_ALT_FALLBACK).not.toMatch(/met/i);
  });

  it("finds the first question a picture quiz can't be published with", () => {
    const qs = [q({ questionImage: PIC }), q({ id: "q2" }), q({ id: "q3", questionImage: "" })];
    expect(firstMissingPicture(qs)).toBe(1);
    expect(firstMissingPicture([q({ questionImage: PIC })])).toBe(-1);
    expect(countPictures(qs)).toBe(1);
  });

  it("notices a description that names the answer, whatever the case or spacing", () => {
    expect(descriptionNamesAnswer(q({ questionImageAlt: "MR.  MET waving" }))).toBe(true);
    expect(descriptionNamesAnswer(q({ questionImageAlt: "Baseball-head mascot" }))).toBe(false);
    expect(descriptionNamesAnswer(q({ itemText: "Oz", questionImageAlt: "a frozen lake" }))).toBe(false); // too short to judge
  });

  it("preloads a picture quiz's pictures, and a text quiz's reveal stills exactly as before", () => {
    const questions = [q({ questionImage: PIC, imageUrl: REVEAL }), q({ id: "q2", imageUrl: "https://youtu.be/x" })];
    expect(gameplayImageUrls({ pictureQuiz: true, questions }, isYouTube)).toEqual([PIC, null]);
    expect(gameplayImageUrls({ questions }, isYouTube)).toEqual([REVEAL, null]);
  });
});

describe("picture_quiz in the games row", () => {
  const base = { id: "g1", date: "2026-10-20", themeTitle: "T", categoryA: "A", categoryB: "B", status: "draft", questions: [] };

  it("saves every other quiz without the column, exactly as before the migration", () => {
    expect("picture_quiz" in gameToRow(base)).toBe(false);
    expect("picture_quiz" in gameToRow({ ...base, pictureQuiz: false })).toBe(false);
  });

  it("sends the flag for a picture quiz, and false to turn it off once the column exists", () => {
    expect(gameToRow({ ...base, pictureQuiz: true }).picture_quiz).toBe(true);
    expect(gameToRow({ ...base, pictureQuiz: false, pictureQuizColumn: true }).picture_quiz).toBe(false);
  });

  it("round-trips through a migrated row, and reads an old row as not a picture quiz", () => {
    const game = rowToGame({ ...gameToRow({ ...base, pictureQuiz: true }) });
    expect(game.pictureQuiz).toBe(true);
    expect(game.pictureQuizColumn).toBe(true);
    const old = rowToGame(gameToRow(base));
    expect(old.pictureQuiz).toBe(false);
    expect(old.pictureQuizColumn).toBe(false);
  });

  it("keeps the database's column knowledge over an older on-device draft", () => {
    const loaded = { ...base, pictureQuiz: true, pictureQuizColumn: true };
    const restored = restoreEditorDraft(loaded, { game: { ...base, pictureQuiz: true, pictureQuizColumn: false } });
    expect(restored.pictureQuizColumn).toBe(true);
  });
});

describe("picture quiz readiness in the Studio", () => {
  it("asks for the picture first, then a description, and calls the item text the answer name", () => {
    expect(questionGaps(q({ itemText: "" }), isYouTube, { picture: true })).toEqual(["Picture", "Answer name"]);
    expect(questionGaps(q({ questionImage: PIC }), isYouTube, { picture: true })).toEqual(["Picture description"]);
    expect(questionGaps(q({ questionImage: PIC, questionImageAlt: "d" }), isYouTube, { picture: true })).toEqual([]);
    expect(missingSummary(["Picture", "Answer name"])).toBe("Missing picture and answer name");
  });

  it("leaves a text quiz's gaps exactly as they were, pictures or not", () => {
    expect(questionGaps(q({ itemText: "", questionImage: "" }), isYouTube)).toEqual(["Item text"]);
  });
});

describe("question pictures when publishing", () => {
  it("lists each picture separately from the reveal media", () => {
    const list = listPuzzleImages({ questions: [q({ questionImage: PIC, imageUrl: REVEAL })] });
    expect(list.map((t) => [t.kind, t.field, t.url])).toEqual([["picture", "questionImage", PIC], ["question", "imageUrl", REVEAL]]);
  });

  it("stores a copied picture in questionImage only, never touching the reveal media", async () => {
    const game = { questions: [q({ questionImage: "https://elsewhere.example/mr-met.png", imageUrl: REVEAL })] };
    const { game: out, failures } = await archivePuzzleImages(game, {
      archive: async (url) => (url.includes("elsewhere") ? PIC : url),
      isExternal: (u) => u.includes("elsewhere"),
    });
    expect(failures).toEqual([]);
    expect(out.questions[0].questionImage).toBe(PIC);
    expect(out.questions[0].imageUrl).toBe(REVEAL);
    expect(out.questions[0].originalImageUrl).toBeUndefined();
  });

  it("names and tracks a failed picture by its own field", async () => {
    const game = { questions: [q({ questionImage: "data:image/png;base64,AAAA" })] };
    const { failures } = await archivePuzzleImages(game, { archive: async () => { throw Object.assign(new Error("x"), { code: "upload" }); } });
    expect(failures).toHaveLength(1);
    expect(imageName(failures[0], game)).toBe("The picture for “Mr. Met”");
    expect(currentImageUrl({ questions: [q({ questionImage: PIC })] }, failures[0])).toBe(PIC);
  });
});

describe("Export text", () => {
  it("says the quiz is a picture quiz and lists each picture under its answer name", () => {
    const text = buildPuzzleExport({ pictureQuiz: true, questions: [q({ questionImage: PIC, questionImageAlt: "Baseball-head mascot" })] });
    expect(text).toContain("Picture quiz: yes");
    expect(text).toContain("Answer name (shown after the answer): Mr. Met");
    expect(text).toContain(`Question picture (shown instead of the name): ${PIC}`);
    expect(text).toContain("Picture description: Baseball-head mascot");
  });

  it("keeps a text quiz's export as before, noting pictures kept from when the option was on", () => {
    const plain = buildPuzzleExport({ questions: [q()] });
    expect(plain).toContain("Picture quiz: no");
    expect(plain).toContain("Item text: Mr. Met");
    expect(plain).not.toContain("Question picture");
    expect(buildPuzzleExport({ questions: [q({ questionImage: PIC })] })).toContain("Question picture (kept; not shown while Picture quiz is off)");
  });
});
