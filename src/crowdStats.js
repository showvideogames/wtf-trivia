/* ============================================================
   Crowd stats for today's finished game, used by the Results hero ("You beat N%") and the
   share text (Results and Home alike).

   Finishing a game: read the stats once as a baseline (the game can't be
   counted yet: it isn't marked completed), save the finished game, and only
   after the database confirms the save read the stats again. The stats are
   rebuilt by a trigger inside the save's own transaction, so that read
   normally counts the game already. It is accepted only when it visibly
   does: compared with the baseline, at least one more finisher at the
   player's score and at least one more finisher overall. Otherwise a couple
   of short, bounded re-reads, then "unavailable", which hides Crowd
   Showdown and leaves the share line at the score alone.

   Revisiting (the game was completed in the database before this page
   loaded): there is no baseline, so the check is only that someone is at
   the player's score; the completed row itself guarantees it is counted.

   Nothing here ever adds the player to the numbers itself, so nothing is
   counted twice.
   ============================================================ */

import { buildImageShareText, buildResultsShareText, strictlyBetterPercent } from "./share.js";

// Waits before the 2nd and 3rd read after the save. Three reads at most,
// ~1.3s of waiting.
export const CROWD_RETRY_DELAYS_MS = [400, 900];

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function histogramTotal(histogram) {
  let total = 0;
  for (const count of Object.values(histogram)) {
    const players = Number(count);
    if (Number.isInteger(players) && players > 0) total += players;
  }
  return total;
}

// Stats whose score histogram accounts for every counted finisher.
function isConsistent(stats) {
  const histogram = stats?.scoreHistogram;
  return Boolean(histogram) && typeof histogram === "object" && histogramTotal(histogram) === stats.finishedPlayers;
}

const playersAt = (stats, score) => Number(stats.scoreHistogram[score]) || 0;

// The verifiable condition. Always: consistent stats with someone at the
// player's score. With a baseline read taken before the save: at least one
// more finisher at that score, and overall, than the baseline had.
export function statsIncludeScore(stats, score, baseline = null) {
  if (!Number.isFinite(score) || !isConsistent(stats) || playersAt(stats, score) < 1) return false;
  if (!isConsistent(baseline)) return true;
  return playersAt(stats, score) >= playersAt(baseline, score) + 1
    && stats.finishedPlayers >= baseline.finishedPlayers + 1;
}

// Reads stats until they include the player's game, within the bounded
// retries. Resolves { status: "ready", stats } or { status: "unavailable",
// reason: "stats-failed" | "stats-not-current" }; never rejects.
export async function loadCrowdStats({ fetchStats, score, baseline = null, sleep = defaultSleep, delays = CROWD_RETRY_DELAYS_MS }) {
  let gotAnyStats = false;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1]);
    let stats = null;
    try { stats = await fetchStats(); } catch { stats = null; }
    if (stats) gotAnyStats = true;
    if (statsIncludeScore(stats, score, baseline)) return { status: "ready", stats, attempts: attempt + 1 };
  }
  return { status: "unavailable", reason: gotAnyStats ? "stats-not-current" : "stats-failed", attempts: delays.length + 1 };
}

// Baseline, save, then read. A failed save means no further reads: the game
// may not be counted, so there is no honest comparison to show. A failed
// baseline only weakens the check to the revisit one. onSaved runs (not
// awaited) as soon as the save is confirmed.
export async function saveThenLoadCrowdStats({ save, fetchStats, score, onSaved, sleep, delays }) {
  let baseline = null;
  try { baseline = await fetchStats(); } catch { baseline = null; }
  try {
    await save();
  } catch (error) {
    return { status: "unavailable", reason: "save-failed", error, attempts: 0 };
  }
  onSaved?.();
  return loadCrowdStats({ fetchStats, score, baseline, sleep, delays });
}

// Crowd stats that belong to this record: ready, and loaded for this exact
// puzzle and score. Anything else means "not available".
export function crowdStatsFor(crowd, record) {
  return crowd?.status === "ready" && Boolean(crowd.puzzleId) && crowd.puzzleId === record?.puzzleId && crowd.score === record?.score
    ? crowd.stats
    : null;
}

// The Results hero's "You beat N% of players": the share text's number
// (strictlyBetterPercent), from stats whose histogram accounts for every
// finisher. Null (no comparison shown) for missing or inconsistent stats.
// saved: true (today's saved result) keeps the check that the player is in
// the stats, so it is also null for the only finisher or a histogram without
// anyone at this score. saved: false (Replay, Admin Preview: never saved)
// compares against all historical finishers, with no exact-score bucket
// needed.
export function crowdBeatPercent(stats, score, { saved = true } = {}) {
  return isConsistent(stats)
    ? strictlyBetterPercent(stats.scoreHistogram, score, { includesPlayer: saved })
    : null;
}

// The one share text for a finished game, used by Results and Home alike.
// Its "Beat N%" is the Results hero's own number for today's saved result.
export function shareTextFor(game, record, crowd) {
  return shareTextsFor(game, record, crowd).text;
}

// Both share texts for one finished game: `text`, the full text with its
// "Beat N%", and `imageText`, the short text (score and dare, no
// percentage) sent alongside the puzzle's artwork.
export function shareTextsFor(game, record, crowd) {
  const beatPercent = crowdBeatPercent(crowdStatsFor(crowd, record), record?.score);
  return {
    text: buildResultsShareText({ game, record, beatPercent }),
    imageText: buildImageShareText({ record }),
  };
}
