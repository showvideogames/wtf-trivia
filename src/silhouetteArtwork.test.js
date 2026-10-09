import { describe, expect, it } from "vitest";
import { gameToRow, rowToGame } from "./gameRow.js";
import { puzzleArtworkUrl, teaserArtworkUrl, wideArtworkUrl } from "./homeShare.js";
import { previewImage, puzzleMeta } from "./puzzleMeta.js";
import { archivePuzzleImages, imageName, listPuzzleImages } from "./admin/publishImages.js";

const SQUARE = "https://cdn.test/square.webp";
const WIDE = "https://cdn.test/wide.webp";
const SIL = "https://cdn.test/silhouette.webp";
const ROW = {
  id: "g-1", date: "2026-10-09", theme_title: "Farm or Not", category_a: "Farm", category_b: "Not",
  category_a_color: "teal", category_b_color: "pink", category_a_image: null, category_b_image: null,
  header_image: SQUARE, wide_image: WIDE, status: "published", questions: [],
};

describe("tomorrow teaser artwork", () => {
  it("uses the silhouette when the puzzle has one", () => {
    expect(teaserArtworkUrl(rowToGame({ ...ROW, silhouette_image: SIL }))).toBe(SIL);
  });
  it("falls back to the wide artwork without a silhouette", () => {
    expect(teaserArtworkUrl(rowToGame({ ...ROW, silhouette_image: null }))).toBe(WIDE);
    expect(teaserArtworkUrl(rowToGame(ROW))).toBe(WIDE); // column not migrated yet
    expect(teaserArtworkUrl({ ...rowToGame(ROW), silhouetteImage: "   " })).toBe(WIDE);
  });
  it("is null (Up Next's own square fallback) with neither", () => {
    expect(teaserArtworkUrl({ headerImage: SQUARE })).toBeNull();
  });
});

describe("silhouette does not replace the normal artwork", () => {
  const game = rowToGame({ ...ROW, silhouette_image: SIL });
  it("leaves the square and wide artwork helpers alone", () => {
    expect(puzzleArtworkUrl(game)).toBe(SQUARE);
    expect(wideArtworkUrl(game)).toBe(WIDE);
  });
  it("never reaches the share preview", () => {
    expect(previewImage(game).url).toBe(WIDE);
    expect(JSON.stringify(puzzleMeta(game))).not.toContain("silhouette");
  });
});

describe("silhouette in the games row and Admin saves", () => {
  it("legacy rows stay valid and save exactly as before", () => {
    const game = rowToGame(ROW);
    expect(game.silhouetteImage).toBe("");
    expect(game.silhouetteImageColumn).toBe(false);
    expect("silhouette_image" in gameToRow(game)).toBe(false);
  });
  it("saves, updates and clears the silhouette", () => {
    const base = rowToGame(ROW);
    const saved = gameToRow({ ...base, silhouetteImage: ` ${SIL} ` });
    expect(saved.silhouette_image).toBe(SIL);
    const loaded = rowToGame(saved);
    expect(loaded.silhouetteImage).toBe(SIL);
    expect(gameToRow({ ...loaded, silhouetteImage: SIL + "?v=2" }).silhouette_image).toBe(SIL + "?v=2");
    expect(gameToRow({ ...loaded, silhouetteImage: "" })).toHaveProperty("silhouette_image", null);
  });
  it("is archived with the other images and named in warnings", async () => {
    const game = { ...rowToGame(ROW), wideImage: "", silhouetteImage: "https://ext.test/s.png", questions: [] };
    const targets = listPuzzleImages(game);
    expect(targets.map((t) => t.key)).toContain("silhouetteImage");
    const out = await archivePuzzleImages(game, { archive: async () => "https://store.test/s.webp" });
    expect(out.game.silhouetteImage).toBe("https://store.test/s.webp");
    expect(imageName(targets.find((t) => t.kind === "silhouette"), game)).toBe("The silhouette artwork");
  });
});
