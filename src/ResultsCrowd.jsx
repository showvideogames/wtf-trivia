import { useId } from "react";
import ScoreHistogram from "./ScoreHistogram.jsx";

const players = (n) => `${n} player${n === 1 ? "" : "s"}`;

// What the crowd side says when there is no honest comparison to draw.
const QUIET_COPY = {
  loading: "Counting the crowd…",
  early: "You’re one of the first players—crowd results are coming soon.",
  unavailable: "Crowd results aren’t available right now. Check back soon!",
};

// The crowd half of the Results hero: "You beat N% of players" beside the
// score distribution. Only state "ready" (a validated beatPercent from
// crowdBeatPercent) shows numbers; every other state is one quiet line, so
// nothing is ever drawn from missing or inconsistent stats. chart is
// histogramBuckets(...) or null, in which case the percentage stands alone.
export function CrowdPanel({ state, beatPercent, chart, stats, score, total, replay = false }) {
  const titleId = useId();
  if (state !== "ready") {
    return (
      <section className="rs-panel rs-crowd rs-crowd-quiet" aria-live="polite">
        <p className="rs-crowd-msg">{QUIET_COPY[state] || QUIET_COPY.unavailable}</p>
      </section>
    );
  }
  return (
    <section className="rs-panel rs-crowd" aria-labelledby={titleId}>
      <div className="rs-crowd-inner">
        <p className="rs-beat">
          <span className="rs-beat-kicker">You beat</span>
          <span className="rs-beat-num">{beatPercent}%</span>
          <span className="rs-beat-sub">of players</span>
        </p>
        <div className="rs-crowd-chart">
          <div className="rs-crowd-head">
            <h2 id={titleId} className="rs-crowd-title">Where you landed</h2>
            <span className="rs-crowd-chip">{players(stats.finishedPlayers)}</span>
          </div>
          {chart && (
            <ScoreHistogram chart={chart} score={score} total={total} averageScore={stats.averageScore} replay={replay}/>
          )}
          <p className="rs-crowd-note">
            {replay
              ? "Only finished first attempts count. Your replay is marked, not counted."
              : "Only finished first attempts count. Replays never change it."}
            {stats.finishedPlayers < 10 && " Early days, so these may still shift."}
          </p>
      </div>
      </div>
    </section>
  );
}

// The two supporting numbers under the hero. Quiet tiles, not cards that
// compete with the score: a tinted edge and a small icon each.
export function CrowdTiles({ stats, total, trophy }) {
  return (
    <>
      <div className="rs-tile rs-tile-avg">
        <span className="rs-tile-icon" aria-hidden="true"><i/><i/><i/></span>
        <div className="rs-tile-text">
          <div className="rs-tile-label">Average score</div>
          <div className="rs-tile-value">{stats.averageScore}/{total}</div>
        </div>
      </div>
      <div className="rs-tile rs-tile-perfect">
        <span className="rs-tile-icon" aria-hidden="true">{trophy}</span>
        <div className="rs-tile-text">
          <div className="rs-tile-label">Perfect scores</div>
          <div className="rs-tile-value">{stats.perfectRate}%</div>
        </div>
      </div>
    </>
  );
}
