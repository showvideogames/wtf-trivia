/* ============================================================
   Share text: the one formatter behind every share route (the
   Results preview and copy button, Home's copy on desktop and
   native share sheet on phones, and the clipboard fallback).
   Pure functions, no DOM or network, so the text can be tested
   exactly. Plain text, one newline between lines, no blank lines,
   no trailing spaces, nothing centred or sized to fit:

     What The Fudge Trivia 🍬
     ━━━━━━━━━━━━━━━━━━━━━━━━━━
     Nicolas Cage Movie 🤩🎬
          OR
     Board Game 🎲♟️
     ━━━━━━━━━━━━━━━━━━━━━━━━━━
     🟢🟢🔴🔴🟢🟢🔴🔴🟢🟢🟢🟢
     8/12 • Beat 77% of players
     whatthefudge.gg
   ============================================================ */

export const SHARE_HEADER = "What The Fudge Trivia 🍬";
// Always 26 heavy horizontal lines (U+2501), whatever the labels' length.
export const SHARE_DIVIDER = "━".repeat(26);
// Always five ASCII spaces, then OR; never positioned from the labels.
export const SHARE_OR = "     OR";
export const SHARE_DOMAIN = "whatthefudge.gg";

// One label on one line: pasted newlines, tabs and runs of whitespace become
// one ASCII space, and the ends are trimmed. Emoji and punctuation are kept
// as entered; nothing is truncated or padded.
export function normalizeShareLabel(label) {
  return typeof label === "string" ? label.replace(/\s+/g, " ").trim() : "";
}

// A puzzle's optional share name for one category (emoji included), or that
// category's normal gameplay name when the share name is blank.
export function shareCategoryName(shareName, categoryName, fallback) {
  return normalizeShareLabel(shareName) || normalizeShareLabel(categoryName) || fallback;
}

// Share of finishers who scored strictly lower than `score`: the "Beat N% of
// players" in the share text and in the Results hero. Read from the puzzle's
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

// A "Beat N%" as crowdBeatPercent (crowdStats.js) produces it: a whole
// number from 0 to 99. Anything else means no percentage is shown.
const isBeatPercent = (value) => Number.isInteger(value) && value >= 0 && value <= 99;

// The full share text. `record` is the finished game record (score,
// totalQuestions, answers in question order: one circle per saved answer);
// `game` supplies the share names and category names; `beatPercent` is
// the Results hero's already-validated "Beat N%" (crowdBeatPercent), or null
// when there is no honest comparison, which leaves the score line bare.
export function buildResultsShareText({ game, record, beatPercent = null }) {
  const score = Number.isFinite(record?.score) ? record.score : 0;
  const total = Number.isFinite(record?.totalQuestions) ? record.totalQuestions : 0;
  const answers = Array.isArray(record?.answers) ? record.answers : [];
  const circles = answers.map((a) => (a?.correct ? "🟢" : "🔴")).join("");
  return [
    SHARE_HEADER,
    SHARE_DIVIDER,
    shareCategoryName(game?.categoryAShareName, game?.categoryA, "Category A"),
    SHARE_OR,
    shareCategoryName(game?.categoryBShareName, game?.categoryB, "Category B"),
    SHARE_DIVIDER,
    circles,
    isBeatPercent(beatPercent) ? `${score}/${total} • Beat ${beatPercent}% of players` : `${score}/${total}`,
    SHARE_DOMAIN,
  ].join("\n");
}
