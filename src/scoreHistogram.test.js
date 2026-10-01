import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { histogramBuckets, histogramSummary, majorAxisScores, showsBucketPercents } from "./scoreHistogram.js";
import { crowdBeatPercent, crowdStatsFor, shareTextFor } from "./crowdStats.js";
import ScoreHistogram from "./ScoreHistogram.jsx";
import { CrowdPanel } from "./ResultsCrowd.jsx";

// The Mario Kart puzzle as the live data shapes it: 8 questions, 52
// finishers, puzzle_stats.score_histogram with string keys.
const MARIO = { 0: 3, 1: 5, 2: 7, 3: 10, 4: 14, 5: 8, 6: 4, 7: 2 };
const MARIO_TOTAL = 53;

describe("histogramBuckets", () => {
  it("makes one bucket per score 0..total, empty ones included, from the real counts", () => {
    const chart = histogramBuckets({ "2": 1, "5": 3 }, 6);
    expect(chart.buckets.map((b) => b.score)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(chart.buckets.map((b) => b.players)).toEqual([0, 0, 1, 0, 0, 3, 0]);
    expect(chart.finishers).toBe(4);
    expect(chart.mean).toBe((2 + 15) / 4);
  });

  it("gives heights relative to the tallest bucket and per-bucket percentages", () => {
    const chart = histogramBuckets(MARIO, 8);
    expect(chart.finishers).toBe(MARIO_TOTAL);
    const four = chart.buckets[4];
    expect(four.height).toBe(1);
    expect(four.percent).toBe(Math.round((14 / MARIO_TOTAL) * 100));
    expect(chart.buckets[8]).toEqual({ score: 8, players: 0, percent: 0, height: 0 });
  });

  it("keeps all 16 buckets for a 15-question puzzle", () => {
    const chart = histogramBuckets({ 15: 1, 0: 1 }, 15);
    expect(chart.buckets).toHaveLength(16);
    expect(chart.buckets.filter((b) => b.players === 0)).toHaveLength(14);
  });

  it("ignores explicit zero counts but never invents any", () => {
    const chart = histogramBuckets({ 0: 0, 3: 2, 99: 0 }, 3);
    expect(chart.buckets.map((b) => b.players)).toEqual([0, 0, 0, 2]);
  });

  it.each([
    ["no histogram", null, 8],
    ["an array", [1, 2, 3], 8],
    ["nobody at all", {}, 8],
    ["only zero counts", { 3: 0 }, 8],
    ["a negative count", { 3: 2, 4: -1 }, 8],
    ["a fractional count", { 3: 1.5 }, 8],
    ["a non-numeric count", { 3: "lots" }, 8],
    ["a score above the question count", { 3: 2, 9: 1 }, 8],
    ["a non-integer score key", { "2.5": 1 }, 8],
    ["a garbage score key", { abc: 1 }, 8],
    ["no question count", { 3: 1 }, 0],
  ])("returns null for %s", (_label, histogram, total) => {
    expect(histogramBuckets(histogram, total)).toBeNull();
  });

  it("returns null when the counts disagree with the finisher total", () => {
    expect(histogramBuckets({ 3: 2, 4: 2 }, 8, { finishers: 5 })).toBeNull();
    expect(histogramBuckets({ 3: 2, 4: 2 }, 8, { finishers: 4 })).not.toBeNull();
  });
});

describe("axis labels", () => {
  it("prints every score up to 10 questions", () => {
    expect([...majorAxisScores(8, 4)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(showsBucketPercents(10)).toBe(true);
  });

  it("keeps the ends, every fifth and the player's score for long puzzles", () => {
    expect([...majorAxisScores(15, 12)].sort((a, b) => a - b)).toEqual([0, 5, 10, 12, 15]);
    expect(showsBucketPercents(15)).toBe(false);
  });
});

describe("summary", () => {
  it("describes every bucket, the player and the average in words", () => {
    const chart = histogramBuckets({ 1: 1, 3: 2 }, 3);
    const text = histogramSummary(chart, { score: 3, total: 3, averageScore: 2 });
    expect(text).toBe("Scores of 3 players: 0 correct, 0 players; 1 correct, 1 player; 2 correct, 0 players; 3 correct, 2 players. " +
      "Your score is 3 out of 3. The average is 2 out of 3.");
    expect(histogramSummary(chart, { score: 0, total: 3, averageScore: 2, replay: true })).toContain("Your replay score is 0 out of 3.");
  });
});

const html = (el) => renderToStaticMarkup(el);
const count = (s, needle) => s.split(needle).length - 1;

describe("ScoreHistogram", () => {
  it("draws one column per score with a single YOU marker and an average label", () => {
    const chart = histogramBuckets(MARIO, 8);
    const out = html(createElement(ScoreHistogram, { chart, score: 4, total: 8, averageScore: 4 }));
    expect(count(out, 'class="rs-hist-col')).toBe(9);
    expect(count(out, ">YOU<")).toBe(1);
    expect(out).toContain("Average <b>4/8</b>");
    expect(out).toContain('class="rs-hist-col is-empty"'); // score 8: nobody, no fake bar
    expect(out).toMatch(/<p class="rs-sr">Scores of 53 players:/);
  });

  it("marks a Replay score without adding it to any bucket", () => {
    const histogram = { 2: 1, 6: 3 };
    const chart = histogramBuckets(histogram, 8);
    const before = JSON.stringify(histogram);
    const out = html(createElement(ScoreHistogram, { chart, score: 5, total: 8, averageScore: 5, replay: true }));
    expect(JSON.stringify(histogram)).toBe(before);
    expect(chart.finishers).toBe(4);
    expect(chart.buckets[5].players).toBe(0);
    expect(out).toContain('class="rs-hist-col is-you is-empty"');
    expect(out).toContain("Your replay score is 5 out of 8");
  });
});

describe("CrowdPanel", () => {
  const stats = { finishedPlayers: MARIO_TOTAL, averageScore: 4, perfectRate: 0, scoreHistogram: MARIO };

  it("shows the same Beat percentage as today's share text", () => {
    const record = { puzzleId: "p1", score: 4, totalQuestions: 8, answers: [] };
    const crowd = { status: "ready", puzzleId: "p1", score: 4, stats };
    const beat = crowdBeatPercent(crowdStatsFor(crowd, record), 4);
    const shared = shareTextFor({}, record, crowd);
    expect(shared).toContain(`4/8 • Beat ${beat}% of players`);
    const out = html(createElement(CrowdPanel, {
      state: "ready", beatPercent: beat, chart: histogramBuckets(MARIO, 8), stats, score: 4, total: 8,
    }));
    expect(out).toContain(`<span class="rs-beat-num">${beat}%</span>`);
    expect(out).toContain("53 players");
  });

  it.each(["early", "unavailable", "loading"])("draws no chart or percentage when %s", (state) => {
    const out = html(createElement(CrowdPanel, { state, beatPercent: null, chart: null, stats: null, score: 4, total: 8 }));
    expect(out).not.toContain("rs-hist");
    expect(out).not.toContain("%");
    expect(out).toContain("rs-crowd-msg");
  });

  it("the sole finisher gets no comparison: no Beat %, so the quiet line", () => {
    const solo = { finishedPlayers: 1, averageScore: 6, scoreHistogram: { 6: 1 } };
    expect(crowdBeatPercent(solo, 6)).toBeNull();
    const out = html(createElement(CrowdPanel, { state: "early", beatPercent: null, chart: null, stats: solo, score: 6, total: 8 }));
    expect(out).toContain("one of the first players");
  });
});
