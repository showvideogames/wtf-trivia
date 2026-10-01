import { histogramSummary, majorAxisScores, showsBucketPercents } from "./scoreHistogram.js";

// "Where you landed": one bar per possible score, heights from the puzzle's
// real histogram (chart = histogramBuckets(...)). The player's bar is the
// saturated one and carries a YOU pill; the average is a dashed line with
// its own label. Both are spelled out in words, and the drawing itself is
// aria-hidden behind a one-sentence summary.
export default function ScoreHistogram({ chart, score, total, averageScore, replay = false }) {
  const count = chart.buckets.length;
  const meanAt = ((chart.mean + 0.5) / count) * 100;
  const majors = majorAxisScores(total, score);
  const percents = showsBucketPercents(total);
  return (
    <figure className={`rs-hist${count > 11 ? " rs-hist-dense" : ""}`} style={{ "--buckets": count }}>
      <p className="rs-sr">{histogramSummary(chart, { score, total, averageScore, replay })}</p>
      <div className="rs-hist-chart" aria-hidden="true">
        <div className={`rs-hist-avg${meanAt > 60 ? " is-flipped" : ""}`} style={{ "--m": chart.mean }}>
          <span className="rs-hist-avg-label">Average <b>{averageScore}/{total}</b></span>
        </div>
        <div className="rs-hist-plot">
          {chart.buckets.map((b) => (
            <div key={b.score} className={`rs-hist-col${b.score === score ? " is-you" : ""}${b.players ? "" : " is-empty"}`}>
              {b.score === score && <span className="rs-hist-you">YOU</span>}
              {percents && b.players > 0 && <span className="rs-hist-pct">{b.percent}%</span>}
              <span className="rs-hist-bar" style={{ "--h": b.height, "--i": b.score }}/>
            </div>
          ))}
        </div>
        <div className="rs-hist-axis">
          {chart.buckets.map((b) => (
            <span key={b.score} className={`${majors.has(b.score) ? "" : "is-minor"}${b.score === score ? " is-you" : ""}`}>{b.score}</span>
          ))}
        </div>
      </div>
      <figcaption className="rs-hist-caption" aria-hidden="true">Score (out of {total})</figcaption>
    </figure>
  );
}
