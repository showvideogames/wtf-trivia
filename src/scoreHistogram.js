/* ============================================================
   "Where you landed": the numbers behind Results' score-distribution
   chart, read from the puzzle's own score histogram
   (puzzle_stats.score_histogram, { "<score>": <finishers> }).

   Pure functions, no DOM, so the chart can be tested exactly. Nothing
   here adds the player to the counts: today's saved result is already in
   the histogram (crowdStats.js checks that), and a Replay or Admin
   Preview score is only marked on the chart, never counted.
   ============================================================ */

const WHOLE_NUMBER = /^\d+$/;

// One bucket per possible score, 0 through the puzzle's question count, with
// the finishers at each score; scores nobody got stay as empty buckets.
// Returns null -- no chart at all -- when the histogram can't be drawn
// honestly: not a plain object, a count that isn't a whole number, a
// finisher at a score outside 0..total, nobody at all, or (when given) a
// total that disagrees with the puzzle's finisher count.
//   finishers: number of finishers this chart is drawn from
//   mean:      their exact average score, for the average marker
//   buckets:   [{ score, players, percent, height }], height relative to
//              the tallest bucket (0..1), percent rounded per bucket
export function histogramBuckets(histogram, total, { finishers: expected } = {}) {
  if (!histogram || typeof histogram !== "object" || Array.isArray(histogram)) return null;
  if (!Number.isInteger(total) || total < 1) return null;
  const counts = new Array(total + 1).fill(0);
  let finishers = 0;
  let scoreSum = 0;
  for (const [key, value] of Object.entries(histogram)) {
    const players = Number(value);
    if (!Number.isInteger(players) || players < 0) return null;
    if (players === 0) continue;
    const score = WHOLE_NUMBER.test(key) ? Number(key) : NaN;
    if (!(score >= 0 && score <= total)) return null;
    counts[score] += players;
    finishers += players;
    scoreSum += score * players;
  }
  if (finishers < 1) return null;
  if (expected !== undefined && expected !== finishers) return null;
  const peak = Math.max(...counts);
  return {
    finishers,
    mean: scoreSum / finishers,
    buckets: counts.map((players, score) => ({
      score,
      players,
      percent: Math.round((players / finishers) * 100),
      height: players / peak,
    })),
  };
}

// The axis numbers that always print. Up to 11 buckets (a 10-question
// puzzle) that is every score; beyond that the ends, every fifth score and
// the player's own, so a 15-question chart stays readable on a phone. The
// rest still print where the chart is wide enough (see results.css).
export function majorAxisScores(total, playerScore) {
  const scores = new Set();
  for (let s = 0; s <= total; s++) {
    if (total <= 10 || s === 0 || s === total || s % 5 === 0 || s === playerScore) scores.add(s);
  }
  return scores;
}

// Bucket percentages above the bars only when there is room for them.
export const showsBucketPercents = (total) => total <= 10;

const players = (n) => `${n} player${n === 1 ? "" : "s"}`;

// The whole chart as one sentence for screen readers: every bucket, the
// player's own score and the average, so nothing depends on colour or on
// seeing the bars.
export function histogramSummary(chart, { score, total, averageScore, replay = false }) {
  const buckets = chart.buckets.map((b) => `${b.score} correct, ${players(b.players)}`).join("; ");
  const you = replay ? "Your replay score" : "Your score";
  return `Scores of ${players(chart.finishers)}: ${buckets}. ${you} is ${score} out of ${total}. ` +
    `The average is ${averageScore} out of ${total}.`;
}
