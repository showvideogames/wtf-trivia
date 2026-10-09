// Result links: one finished game's own address, /s/<puzzleId>.<answers>,
// where <answers> is one 1 (right) or 0 (wrong) per question, in order:
//
//   https://whatthefudge.gg/s/g-1759600000000.111110111111
//
// The address carries the whole result, so nothing is stored and nothing
// depends on the sharer's browser: api/share.js reads
// the puzzle id and answers straight from it, and takes the title and
// artwork from the puzzle itself. The score and question count are counted
// from the answers, never written separately, so they can't disagree.
// Every different result is a different address, which keeps messaging apps'
// link-preview caches from ever showing one result for another.
// Shared by the app and the two functions. Pure.

import { SITE_ORIGIN, isPuzzleId } from "./puzzleLink.js";

export const MAX_RESULT_QUESTIONS = 40;

// "g-1759600000000.101" -> the puzzle id and answers, or null when the code
// isn't a usable result (bad id, no answers, anything but 0/1, too long).
export function parseResultCode(code) {
  if (typeof code !== "string") return null;
  const dot = code.lastIndexOf(".");
  if (dot < 1) return null;
  const puzzleId = code.slice(0, dot);
  const bits = code.slice(dot + 1);
  if (!isPuzzleId(puzzleId)) return null;
  if (!new RegExp(`^[01]{1,${MAX_RESULT_QUESTIONS}}$`).test(bits)) return null;
  const answers = [...bits].map((c) => c === "1");
  return { puzzleId, answers, score: answers.filter(Boolean).length, total: answers.length, code };
}

// The code for a finished game's id and its saved answers ({ correct }),
// or null when they can't make one.
export function resultCode(puzzleId, answers) {
  if (!isPuzzleId(puzzleId) || !Array.isArray(answers)) return null;
  const bits = answers.map((a) => (a?.correct ? "1" : "0")).join("");
  return parseResultCode(`${puzzleId}.${bits}`) ? `${puzzleId}.${bits}` : null;
}

// Whether the answers match the puzzle's own question count (when it is known).
export const answersFit = (game, result) => !Number.isInteger(game?.questionCount) || game.questionCount === result.total;

export const resultPath = (code) => `/s/${encodeURIComponent(code)}`;
export const resultUrl = (code, origin = SITE_ORIGIN) => `${origin}${resultPath(code)}`;

// The code in a /s/<code> path (one trailing slash allowed): null when the
// path isn't a result link, "" when it is but the code is unusable.
export function resultCodeFromPath(pathname) {
  const m = /^\/s\/([^/]*)\/?$/.exec(String(pathname || ""));
  if (!m) return null;
  let code;
  try { code = decodeURIComponent(m[1]); } catch { return ""; }
  return parseResultCode(code) ? code : "";
}

// The result link for a finished game record, or null.
export function resultUrlFor(game, record) {
  const code = resultCode(game?.id ?? record?.puzzleId, record?.answers);
  return code ? resultUrl(code) : null;
}

export const resultCircles = (answers) => answers.map((ok) => (ok ? "🟢" : "🔴")).join("");
