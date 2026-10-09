// /s/<puzzleId>.<answers> (vercel.json rewrites it here as /api/share?code=):
// the app's own page with that one result's link preview written into the
// HTML. Like /puzzle/<id> (api/puzzle.js), crawlers read the tags from this
// first response and never run the app; players get the same page, and the
// app shows the shared result with a button to play that puzzle.
//
// Everything in the preview comes from the address (the answers) and from
// the puzzle's own row (title, artwork); nothing a visitor types is ever
// echoed. Unusable codes, unknown, draft and not-yet-released puzzles and
// any lookup failure get the site's ordinary page, which names no result.

import { loadPreviewGame, loadShell } from "./puzzle.js";
import { previewReleased, withPuzzleMeta } from "../src/puzzleMeta.js";
import { resultCodeFromPath, parseResultCode } from "../src/shareLink.js";
import { resultMeta } from "../src/shareResultMeta.js";
import { answersFit } from "../src/shareLink.js";
import { SITE_ORIGIN } from "../src/puzzleLink.js";

// The origin the preview points at: this deployment's own host (so a
// preview deployment's card works too), else the live site.
export function requestOrigin(req) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return SITE_ORIGIN;
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? `http://${host}` : `https://${host}`;
}

export function requestedCode(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const fromQuery = req.query?.code ?? url.searchParams.get("code");
  if (typeof fromQuery === "string") return fromQuery;
  return resultCodeFromPath(url.pathname) || "";
}

export default async function handler(req, res, deps = {}) {
  const result = parseResultCode(requestedCode(req));
  let shell;
  try {
    shell = await loadShell(req, deps);
  } catch (error) {
    console.error("[share] page unavailable", error);
    res.statusCode = 302;
    res.setHeader("Location", result ? `/?puzzle=${encodeURIComponent(result.puzzleId)}` : "/");
    res.setHeader("Cache-Control", "no-store");
    res.end();
    return;
  }
  let game = null;
  let lookupFailed = false;
  if (result) {
    try { game = await loadPreviewGame(result.puzzleId, { ...deps, withQuestionCount: true }); }
    catch (error) { lookupFailed = true; console.error("[share] lookup failed", error); }
  }
  const released = Boolean(result) && Boolean(game) && previewReleased(game) && answersFit(game, result);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // The address fixes the result, so only a puzzle edit can change the card.
  res.setHeader("Cache-Control", released
    ? "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
    : `public, max-age=0, s-maxage=${lookupFailed ? 15 : 60}`);
  res.setHeader("X-Share-Preview", released ? "result" : "site");
  res.end(released ? withPuzzleMeta(shell, resultMeta(game, result, requestOrigin(req))) : shell);
}
