// The site's own sections and their addresses. Each is a real URL with its
// own browser-history entry, so Back, Forward, swipe-back, a refresh and a
// direct link all land on the same screen (vercel.json serves index.html for
// each path). Puzzle links (/puzzle/<id>), shared results (/s/<code>),
// /admin and /streak-lab keep their own handling.
//
//   home     /              Home, where today's puzzle is played
//   archive  /archive
//   stats    /stats
//   help     /how-to-play   the How to Play dialog, over the page it opened on
export const SECTION_PATHS = {
  home: "/",
  archive: "/archive",
  stats: "/stats",
  help: "/how-to-play",
};

const BY_PATH = new Map(Object.entries(SECTION_PATHS).map(([section, path]) => [path, section]));

// The section an address names, or null for any other address. A trailing
// slash is the same address.
export function sectionFromPath(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  return BY_PATH.get(path) ?? null;
}

// Where the screen being shown belongs in the address bar: [path, the view
// the history entry stands for], or null to leave the address alone.
// - Home, Archive and Stats are their own sections. Account has no address
//   of its own; it sits at / and its entry remembers it (history.state).
// - The daily game and its Results belong to Home: started from the Archive
//   (its Today card) they move to /, so Back returns to the Archive and a
//   refresh resumes from Home. Started from a puzzle link, they keep it.
// - A replay keeps the address it started from (/archive or a puzzle link).
// - Puzzle links, shared results and /admin manage their own addresses.
export function addressForView(view, pathname) {
  switch (view) {
    case "home": case "account": return ["/", view];
    case "archive": return [SECTION_PATHS.archive, view];
    case "stats": return [SECTION_PATHS.stats, view];
    case "game": case "score": {
      const here = sectionFromPath(pathname);
      return here && here !== "help" ? ["/", "home"] : null;
    }
    default: return null;
  }
}

// The view a history entry stands for: the one it was pushed with, or the
// section its address names.
export function entryView(pathname, state) {
  return state?.wtfView ?? sectionFromPath(pathname);
}
