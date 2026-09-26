/* ============================================================
   Gameplay reveal-media preloader.

   A tiny, promise-based, URL-keyed cache that warms the browser's own image
   cache/decode pipeline ahead of the reveal screen, so the visible <img> in
   GameRevealMedia paints instantly from an already-decoded bitmap instead of
   triggering a fresh fetch + decode the moment it mounts. It never renders
   anything itself and never touches YouTube/video URLs -- only plain reveal
   images.

   Sliding-window design: rather than queueing an entire puzzle's images in
   the background, this only ever loads the *active window* -- the current
   question plus the next two -- and moves that window forward as the player
   advances. Someone who quits after question 2 never causes questions 8
   through 13 to be downloaded. A single, separate call (preloadImage) is
   used for the one-off "warm the resume question while the player is still
   looking at Home" case, which deliberately stays outside the window
   machinery since it's a single image, not a puzzle to page through.

   Module-level state (not component state) on purpose: GameScreen mounts and
   unmounts on every view change (Home <-> game <-> replay), and a
   component-local cache would restart the fetch/decode work on every one of
   those remounts. A module-level cache survives across them, so an image
   warmed while the player was still reading the homepage stays warm all the
   way through gameplay.
   ============================================================ */

const cache = new Map(); // url -> {status:'pending'|'loaded'|'error', promise}

// How long to wait for decode() after an image has loaded before treating
// it as ready anyway.
export const DECODE_TIMEOUT_MS = 3000;

// Concurrency control here is the window itself: it is capped at 3 questions
// (current + next two) by primeActiveWindow below, so at most 3 requests are
// ever in flight for gameplay purposes at any one time -- a hard ceiling by
// construction, not a separate semaphore layered on top. All three start
// together, since a semaphore that made "next" or "next+1" queue behind
// "current" would starve the window the moment the player advances while an
// earlier request was still in flight (still-pending images don't get
// evicted just for falling out of the window, so they linger as "active"
// indefinitely on a slow connection).

// A small MRU list of puzzles whose URLs we're deliberately keeping warm.
// Older puzzles fall off and get their cache entries released, so a long
// session replaying many puzzles from Archive doesn't grow this forever.
const MAX_TRACKED_PUZZLES = 3;
const trackedPuzzles = []; // [{key, urls:Set<string>}]

function startLoad(url) {
  let entry = cache.get(url);
  if (entry) return entry;
  entry = { status: "pending", promise: null };
  entry.promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    let settled = false;
    const settle = (status) => {
      if (settled) return;
      settled = true;
      entry.status = status;
      resolve(status);
    };
    img.onload = () => {
      // decode() can reject for reasons unrelated to whether the image is
      // actually usable (e.g. no decode() support, a spurious abort). The
      // image already loaded successfully, so any decode() outcome still
      // counts as "ready" -- decode is a paint-smoothness optimization, not
      // a correctness gate.
      if (typeof img.decode === "function") {
        // Some engines leave decode() pending indefinitely (seen with a page
        // that isn't being drawn). Only this wait is bounded -- the download
        // already finished -- and running out of time still means "loaded",
        // never "error": the <img> will simply decode as it paints.
        const timer = setTimeout(() => settle("loaded"), DECODE_TIMEOUT_MS);
        const done = () => {
          clearTimeout(timer);
          settle("loaded");
        };
        img.decode().then(done, done);
      } else {
        settle("loaded");
      }
    };
    img.onerror = () => settle("error");
    img.src = url;
  });
  cache.set(url, entry);
  return entry;
}

function releaseUrls(urls) {
  urls.forEach((url) => cache.delete(url));
}

function rememberPuzzle(key, urls) {
  if (!key) return;
  let entry = trackedPuzzles.find((p) => p.key === key);
  if (entry) {
    trackedPuzzles.splice(trackedPuzzles.indexOf(entry), 1); // move to MRU end
  } else {
    entry = { key, urls: new Set() };
  }
  urls.forEach((u) => entry.urls.add(u));
  trackedPuzzles.push(entry);
  while (trackedPuzzles.length > MAX_TRACKED_PUZZLES) {
    const evicted = trackedPuzzles.shift();
    const stillNeeded = new Set();
    trackedPuzzles.forEach((p) => p.urls.forEach((u) => stillNeeded.add(u)));
    releaseUrls([...evicted.urls].filter((u) => !stillNeeded.has(u)));
  }
}

/**
 * The media URL worth requesting, or null for "no usable image": missing,
 * null, blank or non-string values, the strings "null"/"undefined" left by
 * hand-edited JSON, and anything that doesn't resolve to an http(s), blob:
 * or data:image URL (javascript:, file paths like C:\..., other schemes).
 * Relative paths are fine. Everything that reads a question's imageUrl goes
 * through this, so a malformed value can never reach the preloader or the
 * reveal's ratio logic. A well-formed URL that 404s is not caught here; the
 * preloader reports it as "error" and the reveal shows "Image unavailable".
 */
export function usableMediaUrl(value) {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url === "null" || url === "undefined") return null;
  if (/^data:/i.test(url)) return /^data:image\//i.test(url) ? url : null;
  try {
    const { protocol } = new URL(url, "https://relative.invalid/");
    return protocol === "https:" || protocol === "http:" || protocol === "blob:" ? url : null;
  } catch {
    return null;
  }
}

/** Start (or reuse) a preload for one URL. Never rejects. */
export function preloadImage(value) {
  const url = usableMediaUrl(value);
  if (!url) return Promise.resolve("none");
  return startLoad(url).promise;
}

/** Synchronous read of a URL's current cache status, if any. */
export function getImageStatus(value) {
  const url = usableMediaUrl(value);
  if (!url) return "none";
  const entry = cache.get(url);
  return entry ? entry.status : "unknown";
}

/**
 * Compute and load a puzzle's active window: the current question's image
 * plus the next two. Nothing outside that window is touched -- an abandoned
 * game never causes the rest of the puzzle to download. Already-cached URLs
 * (including ones that used to be in the window a few questions ago) are
 * left alone; this never re-fetches or evicts something just because it
 * fell out of the window.
 *
 * @param urls - ordered, index-aligned with the puzzle's questions; pass
 *   null/undefined for a question with no image or a video reveal (those are
 *   never handled by this module).
 * @param currentIndex - the question the player is on (or about to see).
 * @param puzzleKey - a stable id for this puzzle, used to release older
 *   puzzles' cache entries once several have been primed in one session.
 * @returns the window's URLs (deduplicated, in order), mainly useful for
 *   tests and callers that want to know exactly what was requested.
 */
export function primeActiveWindow(urls, currentIndex, puzzleKey) {
  const list = Array.isArray(urls) ? urls : [];
  const windowUrls = [...new Set(
    [list[currentIndex], list[currentIndex + 1], list[currentIndex + 2]].map(usableMediaUrl).filter(Boolean)
  )];
  if (puzzleKey) rememberPuzzle(puzzleKey, windowUrls);
  windowUrls.forEach((url) => startLoad(url));
  return windowUrls;
}
