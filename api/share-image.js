// /s/<code>/og.png (rewritten here as /api/share-image?code=): the result
// card's picture, 1200x630. The puzzle's matchup artwork, untouched, with
// the answer dots, the score and the dare under it. The address names the
// result, so every result has its own image address and caches can't mix
// them up. Artwork is the puzzle's own stored image (fetched here, WebP
// converted to PNG for the renderer); a visitor can't supply any image or
// text. An unusable code, an unreleased puzzle or a failed lookup gets a
// plain error status, not a card.

import { readFileSync } from "node:fs";
import satori from "satori";
import sharp from "sharp";
import { loadPreviewGame } from "./puzzle.js";
import { requestedCode, requestOrigin } from "./share.js";
import { previewReleased } from "../src/puzzleMeta.js";
import { answersFit, parseResultCode } from "../src/shareLink.js";
import { IMAGE_SIZE, resultArtUrl } from "../src/shareResultMeta.js";

// Geist Bold (SIL Open Font License, api/_fonts). Satori turns the text into
// outlines, so the PNG step needs no fonts of its own.
const FONT = readFileSync(new URL("./_fonts/Geist-Bold.ttf", import.meta.url));

const CREAM = "#FFEDA0";
const GREEN = "#2BC96B";
const RED = "#FF4466";
const INK = "#2B1B3D";
const ART_BOX = { width: 1200, height: 400 };

// The puzzle's artwork as a PNG data URI sized to fit the art box, or null.
async function loadArt(url, fetchImpl) {
  if (!url) return null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > 8 * 1024 * 1024) return null;
    const { data, info } = await sharp(input)
      .resize({ ...ART_BOX, fit: "inside" })
      .png().toBuffer({ resolveWithObject: true });
    return { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

const h = (type, style, children, props = {}) => ({ type, props: { style, children, ...props } });

export function cardElement({ answers, score, total, art }) {
  const dot = Math.max(20, Math.min(54, Math.floor(1080 / (answers.length * 1.3))));
  const dots = answers.map((ok, i) =>
    h("div", { width: dot, height: dot, borderRadius: dot, marginRight: i < answers.length - 1 ? Math.round(dot * 0.3) : 0, background: ok ? GREEN : RED, display: "flex" }, ""));
  return h("div", { width: IMAGE_SIZE.width, height: IMAGE_SIZE.height, background: CREAM, fontFamily: "Geist", display: "flex", flexDirection: "column", alignItems: "center" }, [
    h("div", { width: ART_BOX.width, height: ART_BOX.height, display: "flex", alignItems: "center", justifyContent: "center" },
      art ? h("img", { width: art.width, height: art.height }, undefined, { src: art.src, width: art.width, height: art.height })
          : h("div", { fontSize: 64, fontWeight: 700, fontFamily: "Geist", color: INK, display: "flex" }, "WHAT THE FUDGE?!")),
    h("div", { display: "flex", marginTop: 6 }, dots),
    h("div", { display: "flex", alignItems: "baseline", marginTop: 14 }, [
      h("div", { fontSize: 74, fontWeight: 700, fontFamily: "Geist", color: INK, marginRight: 24, display: "flex" }, `${score}/${total}`),
      h("div", { fontSize: 40, fontWeight: 700, fontFamily: "Geist", color: INK, display: "flex" }, "Can you beat my score?!"),
    ]),
    h("div", { fontSize: 26, color: INK, opacity: 0.6, marginTop: 4, display: "flex" }, "whatthefudge.gg"),
  ]);
}

export default async function handler(req, res, deps = {}) {
  const { fetchImpl = fetch } = deps;
  const result = parseResultCode(requestedCode(req));
  const fail = (status) => {
    res.statusCode = status;
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    res.end();
  };
  if (!result) return fail(404);
  let game;
  try { game = await loadPreviewGame(result.puzzleId, { ...deps, withQuestionCount: true }); }
  catch (error) { console.error("[share-image] lookup failed", error); return fail(502); }
  if (!game || !previewReleased(game) || !answersFit(game, result)) return fail(404);
  try {
    const art = await loadArt(resultArtUrl(game, requestOrigin(req)), fetchImpl);
    const svg = await satori(cardElement({ ...result, art }), {
      ...IMAGE_SIZE, fonts: [{ name: "Geist", data: FONT, weight: 700, style: "normal" }],
    });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
    res.end(png);
  } catch (error) {
    console.error("[share-image] render failed", error);
    fail(500);
  }
}
