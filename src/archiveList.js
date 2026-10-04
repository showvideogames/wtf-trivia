// Archive list logic, kept apart from the screen so it can be tested.
//
// Which puzzles appear is unchanged from the original Archive: every
// published puzzle, plus a retired one only when this player has a result
// for it. Newest first; only a published puzzle can be today's.

import { TOPICS, foldText, normalizeTags, topicLabels } from "./topics.js";

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

// Matched against the title, both category names and the puzzle's topic
// labels, ignoring case and accents both ways ("pokemon" finds "Pokémon" and
// "Pokémon" finds "Pokemon"). Every word typed must appear somewhere, so
// "nic cage" finds "Board Game or Nicolas Cage Movie?".
export function matchesArchiveSearch(game, query) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = foldText(
    [game.themeTitle, game.categoryA, game.categoryB, ...topicLabels(game.tags)]
      .filter(Boolean)
      .join(" "),
  );
  return words.every((w) => haystack.includes(w));
}

export function hasTopic(game, topic) {
  return normalizeTags(game.tags).includes(topic);
}

// The topic menu: every topic carried by at least one puzzle in the list,
// with how many carry it, in the TOPICS order. Callers pass the whole
// Archive (before search and filters) so the counts hold still while typing.
// A puzzle with several topics counts once under each.
export function archiveTopicCounts(puzzles) {
  const counts = new Map();
  for (const g of puzzles) {
    for (const id of normalizeTags(g.tags)) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return TOPICS.filter((t) => counts.has(t.id)).map((t) => ({ ...t, count: counts.get(t.id) }));
}

// Search, the All / Unplayed / Completed filter and the topic all narrow
// together. topic "all" means any topic, untagged puzzles included.
export function filterArchive(puzzles, records, { query = "", filter = "all", topic = "all" } = {}) {
  return puzzles.filter((g) => {
    const done = isCompleted(records[g.id]);
    if (filter === "completed" && !done) return false;
    if (filter === "unplayed" && done) return false;
    if (topic !== "all" && !hasTopic(g, topic)) return false;
    return matchesArchiveSearch(g, query);
  });
}
