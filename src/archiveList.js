// Archive list logic, kept apart from the screen so it can be tested.
//
// Which puzzles appear is unchanged from the original Archive: every
// published puzzle, plus a retired one only when this player has a result
// for it. Newest first; only a published puzzle can be today's.

export const ARCHIVE_FILTERS = [
  { id: "all", label: "All" },
  { id: "unplayed", label: "Unplayed" },
  { id: "completed", label: "Completed" },
];

export function archivePuzzles(games, records, today) {
  const list = games
    .filter((g) => g.status === "published" || (g.status === "retired" && records[g.id]))
    .sort((a, b) => b.date.localeCompare(a.date));
  const todayGame = list.find((g) => g.date === today && g.status === "published") || null;
  // Today's puzzle leads the list, as it always has.
  const ordered = todayGame ? [todayGame, ...list.filter((g) => g !== todayGame)] : list;
  return { puzzles: ordered, todayGame };
}

export function isCompleted(record) {
  return Boolean(record?.completed);
}

// Case-insensitive, matched against the title and both category names.
// Every word typed must appear somewhere, so "nic cage" finds
// "Board Game or Nicolas Cage Movie?".
export function matchesArchiveSearch(game, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [game.themeTitle, game.categoryA, game.categoryB]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export function filterArchive(puzzles, records, { query = "", filter = "all" } = {}) {
  return puzzles.filter((g) => {
    const done = isCompleted(records[g.id]);
    if (filter === "completed" && !done) return false;
    if (filter === "unplayed" && done) return false;
    return matchesArchiveSearch(g, query);
  });
}
