// Archive list logic, kept apart from the screen so it can be tested.
//
// Which puzzles appear: every released puzzle (published and dated today or
// earlier, schedule.js), plus a retired one only when this player has a
// result for it. A published puzzle scheduled after today never appears, so
// it can't be played early (Home's Up Next teases it instead). Newest first;
// only a published puzzle can be today's. Search, the status filter
// (Favorites included) and the topic narrow it; the Sort menu orders what is
// left.

import { isReleased } from "./schedule.js";
import { TOPICS, foldText, normalizeTags, topicLabels } from "./topics.js";

export const ARCHIVE_FILTERS = [
  { id: "all", label: "All" },
  { id: "unplayed", label: "Unplayed" },
  { id: "completed", label: "Completed" },
  { id: "favorites", label: "Favorites" },
];

export const ARCHIVE_SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "hardest", label: "Hardest" },
  { id: "easiest", label: "Easiest" },
  { id: "liked", label: "Most liked" },
  { id: "played", label: "Most played" },
];

// A puzzle needs this many finished plays before Hardest/Easiest rank it.
export const MIN_RANKED_PLAYS = 5;

export function archivePuzzles(games, records, today) {
  const list = games
    .filter((g) => isReleased(g, today) || (g.status === "retired" && records[g.id]))
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

// Search, the All / Unplayed / Completed / Favorites filter and the topic
// all narrow together. topic "all" means any topic, untagged puzzles
// included. `favorites` is the Set of this player's favorite puzzle ids, or
// null when it isn't known (Favorites then shows nothing rather than
// guessing; the screen disables it).
export function filterArchive(puzzles, records, { query = "", filter = "all", topic = "all", favorites = null } = {}) {
  return puzzles.filter((g) => {
    const done = isCompleted(records[g.id]);
    if (filter === "completed" && !done) return false;
    if (filter === "unplayed" && done) return false;
    if (filter === "favorites" && !favorites?.has(g.id)) return false;
    if (topic !== "all" && !hasTopic(g, topic)) return false;
    return matchesArchiveSearch(g, query);
  });
}

// Average share of questions answered correctly, from a puzzle's community
// stats { totalFinished, totalScore, totalQuestions }:
//   totalScore / (totalFinished × totalQuestions)
// so puzzles of different lengths compare fairly. null (unranked) with
// fewer than MIN_RANKED_PLAYS finished plays, or when the numbers are
// missing, not whole, or impossible (more points than could be scored).
const wholeNumber = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
export function puzzleAccuracy(stat) {
  if (!stat) return null;
  const finished = wholeNumber(stat.totalFinished);
  const score = wholeNumber(stat.totalScore);
  const questions = wholeNumber(stat.totalQuestions);
  if (![finished, score, questions].every(Number.isInteger)) return null;
  if (finished < MIN_RANKED_PLAYS || questions <= 0 || score < 0) return null;
  const possible = finished * questions;
  if (score > possible) return null;
  return score / possible;
}

const text = (v) => String(v ?? "");
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// Puzzles on the same date fall back to title, then id, so the order never
// wobbles between loads.
function byTitle(a, b) {
  return byText(text(a.themeTitle).toLowerCase(), text(b.themeTitle).toLowerCase()) || byText(text(a.id), text(b.id));
}
export function byNewest(a, b) {
  return byText(text(b.date), text(a.date)) || byTitle(a, b);
}
export function byOldest(a, b) {
  return byText(text(a.date), text(b.date)) || byTitle(a, b);
}

// A puzzle's play count, from its community stats (puzzle_stats): how many
// players finished it on its day. Each player has at most one saved play per
// puzzle, saved only by the normal daily game, so Replay, Admin Preview and
// unfinished games never count. A puzzle nobody has finished has no stats
// row: 0. Anything that isn't a whole, non-negative number is 0 too.
export function playCount(stat) {
  const n = wholeNumber(stat?.totalFinished);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// Whether a sort can run with the data that loaded. Newest and Oldest
// always can; Hardest, Easiest and Most played need the stats, Most liked
// the counts.
export function sortAvailable(sort, { stats = null, favoriteCounts = null } = {}) {
  if (sort === "hardest" || sort === "easiest" || sort === "played") return Boolean(stats);
  if (sort === "liked") return Boolean(favoriteCounts);
  return true;
}

// Orders the (already filtered) list. Newest keeps today's puzzle first, as
// the Archive always has. Hardest = lowest accuracy first, Easiest =
// highest; unranked puzzles follow the ranked ones, newest first. Most liked
// = most favorites first, Most played = most plays first (playCount), each
// newest first among equals (zero included). A sort whose data didn't load
// falls back to Newest.
//   stats: { [puzzleId]: { totalFinished, totalScore, totalQuestions } }
//   favoriteCounts: { [puzzleId]: number }
export function sortArchive(puzzles, sort = "newest", { todayGame = null, stats = null, favoriteCounts = null } = {}) {
  const list = [...puzzles];
  if (!sortAvailable(sort, { stats, favoriteCounts })) sort = "newest";
  if (sort === "oldest") return list.sort(byOldest);
  if (sort === "hardest" || sort === "easiest") {
    const accuracy = new Map(list.map((g) => [g.id, puzzleAccuracy(stats[g.id])]));
    const sign = sort === "hardest" ? 1 : -1;
    return list.sort((a, b) => {
      const x = accuracy.get(a.id);
      const y = accuracy.get(b.id);
      if (x === null || y === null) return x === y ? byNewest(a, b) : x === null ? 1 : -1;
      return sign * (x - y) || byNewest(a, b);
    });
  }
  if (sort === "liked") {
    const likes = (g) => {
      const n = Number(favoriteCounts[g.id]);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    return list.sort((a, b) => likes(b) - likes(a) || byNewest(a, b));
  }
  if (sort === "played") {
    const plays = new Map(list.map((g) => [g.id, playCount(stats[g.id])]));
    return list.sort((a, b) => plays.get(b.id) - plays.get(a.id) || byNewest(a, b));
  }
  list.sort(byNewest);
  const at = todayGame ? list.indexOf(todayGame) : -1;
  if (at > 0) list.unshift(...list.splice(at, 1));
  return list;
}
