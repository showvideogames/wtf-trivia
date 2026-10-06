import { describe, it, expect } from "vitest";
import {
  ARCHIVE_CONCURRENCY,
  archivePuzzleImages,
  currentImageUrl,
  describeImageWarning,
  failureReason,
  imageName,
  isWarningResolved,
  listPuzzleImages,
} from "./publishImages.js";

const EXT = "https://legacy.example.com/";
const STORE = "https://store.example.com/wtf-images/";
const q = (id, itemText, extra) => ({ id, itemText, correctCategory: "A", ...extra });
const puzzle = (extra = {}) => ({
  id: "g1", date: "2026-10-15", status: "published", themeTitle: "Farm or Not", categoryA: "Farm", categoryB: "Not",
  headerImage: EXT + "header.png", categoryAImage: EXT + "a.png", categoryBImage: EXT + "b.png",
  questions: [q("q1", "Cow", { imageUrl: EXT + "cow.jpg" }), q("q2", "Pig", { imageUrl: EXT + "pig.jpg" }), q("q3", "Hen", { imageUrl: EXT + "hen.jpg" })],
  ...extra,
});
const err = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });
// A fake archiver: copies everything to STORE except the URLs listed as failing.
const archiver = (failing = {}) => {
  const calls = [];
  const archive = async (url) => {
    calls.push(url);
    if (failing[url]) throw failing[url];
    return url.startsWith(EXT) ? url.replace(EXT, STORE) : url;
  };
  return { archive, calls, isExternal: (u) => u.startsWith(EXT) };
};

describe("listPuzzleImages", () => {
  it("lists header, categories and every question image, skipping blank, missing and null", () => {
    const g = puzzle({ questions: [q("q1", "Cow", { imageUrl: EXT + "cow.jpg" }), q("q2", "Blank", { imageUrl: "" }), q("q3", "None", {}), q("q4", "Null", { imageUrl: null }), q("q5", "Spaces", { imageUrl: "  " })] });
    expect(listPuzzleImages(g).map((t) => t.key)).toEqual(["headerImage", "categoryAImage", "categoryBImage", "question:q1"]);
  });
  it("returns nothing for a puzzle without images", () => {
    expect(listPuzzleImages(puzzle({ headerImage: "", categoryAImage: null, categoryBImage: undefined, questions: [q("q1", "Cow", {})] }))).toEqual([]);
    expect(listPuzzleImages({})).toEqual([]);
  });
});

describe("archivePuzzleImages", () => {
  it("1. uses every new permanent URL when all imports succeed", async () => {
    const a = archiver();
    const { game, failures, copied } = await archivePuzzleImages(puzzle(), a);
    expect(failures).toEqual([]);
    expect(copied).toBe(6);
    expect(game.headerImage).toBe(STORE + "header.png");
    expect(game.categoryAImage).toBe(STORE + "a.png");
    expect(game.questions.map((x) => x.imageUrl)).toEqual([STORE + "cow.jpg", STORE + "pig.jpg", STORE + "hen.jpg"]);
    expect(game.questions[1].originalImageUrl).toBe(EXT + "pig.jpg");
  });

  it("2. one failed question keeps its existing URL; the rest still import", async () => {
    const a = archiver({ [EXT + "pig.jpg"]: err("blocked") });
    const { game, failures } = await archivePuzzleImages(puzzle(), a);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ kind: "question", questionId: "q2", itemText: "Pig", url: EXT + "pig.jpg", code: "blocked" });
    expect(game.questions[1].imageUrl).toBe(EXT + "pig.jpg");
    expect(game.questions[1].originalImageUrl).toBeUndefined();
    expect(game.questions[0].imageUrl).toBe(STORE + "cow.jpg");
    expect(game.questions[2].imageUrl).toBe(STORE + "hen.jpg");
    expect(a.calls).toHaveLength(6); // every image was still attempted
  });

  it("3. several failed questions are all reported together", async () => {
    const a = archiver({ [EXT + "pig.jpg"]: err("blocked"), [EXT + "hen.jpg"]: err("http", { status: 404 }) });
    const { game, failures } = await archivePuzzleImages(puzzle(), a);
    expect(failures.map((f) => f.itemText)).toEqual(["Pig", "Hen"]);
    expect(failures[1].status).toBe(404);
    expect(game.questions.map((x) => x.imageUrl)).toEqual([STORE + "cow.jpg", EXT + "pig.jpg", EXT + "hen.jpg"]);
  });

  it("4. a failed header keeps the header URL", async () => {
    const { game, failures } = await archivePuzzleImages(puzzle(), archiver({ [EXT + "header.png"]: err("timeout") }));
    expect(failures.map((f) => f.kind)).toEqual(["header"]);
    expect(game.headerImage).toBe(EXT + "header.png");
    expect(game.categoryAImage).toBe(STORE + "a.png");
  });

  it("5. a failed category keeps that category URL only", async () => {
    const { game, failures } = await archivePuzzleImages(puzzle(), archiver({ [EXT + "b.png"]: err("not-image") }));
    expect(failures.map((f) => [f.kind, f.slot])).toEqual([["category", "B"]]);
    expect(game.categoryBImage).toBe(EXT + "b.png");
    expect(game.categoryAImage).toBe(STORE + "a.png");
  });

  it("6. a mix of successes and failures applies exactly the successes", async () => {
    const a = archiver({ [EXT + "header.png"]: err("blocked"), [EXT + "a.png"]: err("upload"), [EXT + "hen.jpg"]: err("blocked") });
    const { game, failures, copied } = await archivePuzzleImages(puzzle(), a);
    expect(failures.map((f) => f.key)).toEqual(["headerImage", "categoryAImage", "question:q3"]);
    expect(copied).toBe(3);
    expect(game.headerImage).toBe(EXT + "header.png");
    expect(game.categoryAImage).toBe(EXT + "a.png");
    expect(game.categoryBImage).toBe(STORE + "b.png");
    expect(game.questions.map((x) => x.imageUrl)).toEqual([STORE + "cow.jpg", STORE + "pig.jpg", EXT + "hen.jpg"]);
  });

  it("never erases or blanks a URL, whatever the archiver returns or throws", async () => {
    const weird = { archive: async (url) => { if (url.includes("cow")) return ""; if (url.includes("pig")) return undefined; if (url.includes("hen")) throw undefined; return url; } };
    const { game, failures } = await archivePuzzleImages(puzzle(), weird);
    expect(game.questions.map((x) => x.imageUrl)).toEqual([EXT + "cow.jpg", EXT + "pig.jpg", EXT + "hen.jpg"]);
    expect(failures.map((f) => f.itemText)).toEqual(["Hen"]);
  });

  it("does not mutate the puzzle it was given", async () => {
    const g = puzzle();
    const before = JSON.stringify(g);
    await archivePuzzleImages(g, archiver({ [EXT + "pig.jpg"]: err("blocked") }));
    expect(JSON.stringify(g)).toBe(before);
  });

  it("leaves questions without images untouched and handles a puzzle with no images", async () => {
    const g = puzzle({ headerImage: "", categoryAImage: "", categoryBImage: "", questions: [q("q1", "Cow", {}), q("q2", "Pig", { imageUrl: "" }), q("q3", "Hen", { imageUrl: null })] });
    const a = archiver();
    const { game, failures, copied } = await archivePuzzleImages(g, a);
    expect(a.calls).toEqual([]);
    expect(failures).toEqual([]);
    expect(copied).toBe(0);
    expect(game.questions).toEqual(g.questions);
    expect("imageUrl" in game.questions[0]).toBe(false);
  });

  it("keeps an earlier originalImageUrl rather than overwriting it", async () => {
    const g = puzzle({ questions: [q("q1", "Cow", { imageUrl: EXT + "cow2.jpg", originalImageUrl: EXT + "cow-first.jpg" })] });
    const { game } = await archivePuzzleImages(g, archiver());
    expect(game.questions[0]).toMatchObject({ imageUrl: STORE + "cow2.jpg", originalImageUrl: EXT + "cow-first.jpg" });
  });

  it("never has more than the concurrency limit in flight", async () => {
    let inFlight = 0; let peak = 0;
    const many = puzzle({ questions: Array.from({ length: 12 }, (_, i) => q(`q${i}`, `Q${i}`, { imageUrl: `${EXT}${i}.jpg` })) });
    await archivePuzzleImages(many, { archive: async (u) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return u; } });
    expect(peak).toBeLessThanOrEqual(ARCHIVE_CONCURRENCY);
  });
});

describe("warnings", () => {
  const g = puzzle();
  const f = (extra) => ({ kind: "question", field: "imageUrl", questionId: "q2", questionIndex: 1, itemText: "Pig", url: EXT + "pig.jpg", code: "blocked", ...extra });

  it("uses the exact single-image wording", () => {
    const d = describeImageWarning([f()], g, "Published");
    expect(d.title).toBe("Published with 1 image warning");
    expect(d.body).toBe("“Pig” couldn't be copied into permanent storage. Its existing image was kept, but you may want to upload a replacement.");
  });
  it("uses plural wording for several images", () => {
    const d = describeImageWarning([f(), f({ questionId: "q3", itemText: "Hen" }), { kind: "header", field: "headerImage", url: "x", code: "blocked" }], g, "Published");
    expect(d.title).toBe("Published with 3 image warnings");
    expect(d.body).toMatch(/^These images couldn't be copied/);
    expect(d.body).toMatch(/replacements\.$/);
  });
  it("says a broken link will show as unavailable", () => {
    expect(describeImageWarning([f({ code: "http", status: 404 })], g).body).toMatch(/link is broken.*Image unavailable/);
    expect(failureReason(f({ code: "http", status: 404 }))).toMatch(/broken.*404/);
    expect(failureReason(f({ code: "http", status: 500 }))).toMatch(/error \(500\)/);
  });
  it("uses Saved for drafts", () => {
    expect(describeImageWarning([f()], g, "Saved").title).toBe("Saved with 1 image warning");
  });
  it("names header, category and untitled question images", () => {
    expect(imageName({ kind: "header" }, g)).toBe("The Home & Share artwork");
    expect(imageName({ kind: "category", slot: "B" }, g)).toBe("The Category B image (Not)");
    expect(imageName({ kind: "question", itemText: "  ", questionIndex: 4 }, g)).toBe("“Question 5”");
  });
  it("gives a plain reason for every failure code", () => {
    for (const code of ["blocked", "timeout", "not-image", "upload", "upload-auth", "upload-network", "optimize", "mystery"]) expect(failureReason(f({ code, reason: "x" })).length).toBeGreaterThan(0);
  });
  it("tells a refused copy (sign-in) apart from an unreachable store (connection)", () => {
    expect(failureReason(f({ code: "upload-auth" }))).toMatch(/admin account/);
    expect(failureReason(f({ code: "upload-auth" }))).not.toMatch(/connection/);
    expect(failureReason(f({ code: "upload-network" }))).toMatch(/connection/);
    expect(failureReason(f({ code: "upload-network" }))).not.toMatch(/admin/);
  });

  it("14. resolves once the field holds a different image, and not before", () => {
    const failure = f();
    expect(isWarningResolved(g, failure)).toBe(false);
    const replaced = { ...g, questions: g.questions.map((x) => (x.id === "q2" ? { ...x, imageUrl: STORE + "pig-new.webp" } : x)) };
    expect(isWarningResolved(replaced, failure)).toBe(true);
    const header = { kind: "header", field: "headerImage", url: g.headerImage };
    expect(isWarningResolved(g, header)).toBe(false);
    expect(isWarningResolved({ ...g, headerImage: STORE + "h.webp" }, header)).toBe(true);
  });
  it("finds a question by id even after reordering, and by index without an id", () => {
    const reordered = { ...g, questions: [g.questions[2], g.questions[1], g.questions[0]] };
    expect(currentImageUrl(reordered, f())).toBe(EXT + "pig.jpg");
    const noIds = { ...g, questions: g.questions.map((x) => { const copy = { ...x }; delete copy.id; return copy; }) };
    expect(currentImageUrl(noIds, f({ questionId: undefined }))).toBe(EXT + "pig.jpg");
    const deleted = { ...g, questions: [g.questions[0]] };
    expect(isWarningResolved(deleted, f())).toBe(true); // question removed: nothing left to replace
  });
});
