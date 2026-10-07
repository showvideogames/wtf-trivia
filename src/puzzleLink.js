// Puzzle links: every puzzle's permanent address, /puzzle/<id>, built from
// games.id (a puzzle's identity, which never changes when it is rescheduled).
// Shared by the app (share text, opening a link) and the link-preview
// function (api/puzzle.js), so both always agree on the address. Pure.

// Links always point at the live site, wherever the share was made.
export const SITE_ORIGIN = "https://whatthefudge.gg";

// A usable id: 1-200 characters, none of them whitespace, a slash, ? or #.
// (Studio ids look like "g-1759600000000"; anything else is never looked up.)
const PUZZLE_ID = /^[^\s/?#]{1,200}$/;

export function isPuzzleId(id) {
  return typeof id === "string" && PUZZLE_ID.test(id);
}

// "/puzzle/g-1759600000000"
export function puzzlePath(id) {
  return `/puzzle/${encodeURIComponent(id)}`;
}

// "https://whatthefudge.gg/puzzle/g-1759600000000"
export function puzzleUrl(id, origin = SITE_ORIGIN) {
  return `${origin}${puzzlePath(id)}`;
}

// The id in a /puzzle/<id> path (one trailing slash allowed), or null when
// the path isn't a puzzle link at all. A puzzle link whose id can't be used
// (badly encoded, too long, ...) gives "", so the app can say the puzzle
// isn't available instead of quietly showing something else.
export function puzzleIdFromPath(pathname) {
  const m = /^\/puzzle\/([^/]*)\/?$/.exec(String(pathname || ""));
  if (!m) return null;
  let id;
  try { id = decodeURIComponent(m[1]); } catch { return ""; }
  return isPuzzleId(id) ? id : "";
}
