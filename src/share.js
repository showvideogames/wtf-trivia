/* ============================================================
   Results share text. Pure functions, no DOM or network, so the
   copied text can be tested exactly. The Results preview renders
   this same string line by line, so preview and clipboard agree.

     Harry Potter Character 🧙‍♂️
     OR
     Pro Hockey Player? 🏒
     🔴🔴🔴🟢🟢🟢🟢🟢🔴🔴
     5/10 ➜ Beat 20% of players
     whatthefudgetrivia.com
   ============================================================ */

export const SHARE_DOMAIN = "whatthefudgetrivia.com";

// A puzzle's optional share name for one category, or that category's normal
// name when the share name is blank. Whitespace-only counts as blank.
export function shareCategoryName(shareName, categoryName, fallback) {
  const custom = typeof shareName === "string" ? shareName.trim() : "";
  if (custom) return custom;
  const normal = typeof categoryName === "string" ? categoryName.trim() : "";
  return normal || fallback;
}

// Share of finishers who scored strictly lower than `score`: the "Beat N% of
// players" in the share text and in Crowd Showdown. Read from the puzzle's
// score histogram ({ "<score>": <players> }), which must already
// include this player's own finished game (see crowdStats.js). Players tied
// with you are not beaten, so they never count toward the number; everyone,
// you included exactly once, counts toward the total. Rounded down, so the
// claim is never larger than the truth. Because you are in the total but can
// never beat yourself, the result is at most 99. Returns null when there is
// no honest comparison: no data, a histogram without anyone at your score
// (so you aren't counted), or you as the only finisher. Nobody lower is 0.
//
// includesPlayer: false is for scores that are never saved (Replay, Admin
// Preview): the histogram is just the historical finishers, so no one needs
// to be at your score, and one historical finisher is enough. The same
// strictly-lower count over all of them, still rounded down and capped at 99.
export function strictlyBetterPercent(histogram, score, { includesPlayer = true } = {}) {
  if (!histogram || typeof histogram !== "object" || !Number.isFinite(score)) return null;
  let total = 0;
  let lower = 0;
  let atScore = 0;
  for (const [bucket, count] of Object.entries(histogram)) {
    const bucketScore = Number(bucket);
    const players = Number(count);
    if (!Number.isFinite(bucketScore) || !Number.isInteger(players) || players <= 0) continue;
    total += players;
    if (bucketScore < score) lower += players;
    if (bucketScore === score) atScore += players;
  }
  if (includesPlayer ? atScore < 1 || total < 2 : total < 1) return null;
  return Math.min(99, Math.floor((lower / total) * 100));
}

// The full copied text. `record` is the finished game record (score,
// totalQuestions, answers in question order); `game` supplies the category
// names; `histogram` is the crowd score histogram, or null when unavailable.
export function buildResultsShareText({ game, record, histogram }) {
  const score = Number.isFinite(record?.score) ? record.score : 0;
  const total = Number.isFinite(record?.totalQuestions) ? record.totalQuestions : 0;
  const answers = Array.isArray(record?.answers) ? record.answers : [];
  const dots = answers.map((a) => (a?.correct ? "🟢" : "🔴")).join("");
  const percent = strictlyBetterPercent(histogram, score);
  return [
    shareCategoryName(game?.categoryAShareName, game?.categoryA, "Category A"),
    "OR",
    shareCategoryName(game?.categoryBShareName, game?.categoryB, "Category B"),
    dots,
    percent === null ? `${score}/${total}` : `${score}/${total} ➜ Beat ${percent}% of players`,
    SHARE_DOMAIN,
  ].join("\n");
}
