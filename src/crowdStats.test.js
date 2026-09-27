import { describe, it, expect, vi } from "vitest";
import {
  CROWD_RETRY_DELAYS_MS, crowdBeatPercent, crowdHistogramFor, crowdStatsFor, loadCrowdStats, saveThenLoadCrowdStats, shareTextFor, statsIncludeScore,
} from "./crowdStats.js";

// Stats shaped like dbGetPuzzleCommunityStats returns them (the fields these
// tests need).
function stats(histogram) {
  const entries = Object.entries(histogram).map(([s, n]) => [Number(s), n]);
  const finishedPlayers = entries.reduce((sum, [, n]) => sum + n, 0);
  return { finishedPlayers, scoreHistogram: histogram };
}

// A fake backend: a queue of responses for successive stats reads (the last
// one repeats), and a log of everything that happened, in order.
function backend({ saveFails = false, reads }) {
  const log = [];
  const queue = [...reads];
  return {
    log,
    save: vi.fn(async () => {
      log.push("save:start");
      if (saveFails) { log.push("save:failed"); throw new Error("Supabase error 500"); }
      log.push("save:confirmed");
    }),
    fetchStats: vi.fn(async () => {
      log.push("stats:read");
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return next;
    }),
    sleep: vi.fn(async (ms) => { log.push(`sleep:${ms}`); }),
  };
}

const HP = {
  categoryA: "Harry Potter Characters", categoryB: "Professional Hockey Players",
  categoryAShareName: "Harry Potter Character 🧙‍♂️", categoryBShareName: "Pro Hockey Player? 🏒",
};
const answers = (pattern) => [...pattern].map((c, i) => ({ questionIndex: i, correct: c === "1" }));
const record = (pattern, date = "2026-09-27") => ({
  date, score: [...pattern].filter((c) => c === "1").length, totalQuestions: pattern.length, answers: answers(pattern), completed: true,
});
const scoreLine = (game, rec, crowd) => shareTextFor(game, rec, crowd).split("\n")[4];

// What handleComplete does: baseline, save, then read; stored with the
// record's date and score.
async function finish(rec, be) {
  const result = await saveThenLoadCrowdStats({ save: be.save, fetchStats: be.fetchStats, score: rec.score, sleep: be.sleep });
  return { date: rec.date, score: rec.score, ...result };
}

// In every `reads` list below, the first entry is the baseline taken before
// the save; the rest are reads after it.
describe("baseline, save, then read crowd stats", () => {
  it("1. reads again when the first read after the save doesn't include the new result yet", async () => {
    const rec = record("0001111100"); // 5/10
    const be = backend({ reads: [
      stats({ 4: 2, 7: 5 }, 5),        // baseline
      stats({ 4: 2, 7: 5 }, 5),        // too early: unchanged
      stats({ 4: 2, 5: 1, 7: 5 }, 5),  // now includes this game
    ] });
    const crowd = await finish(rec, be);
    expect(be.log).toEqual(["stats:read", "save:start", "save:confirmed", "stats:read", `sleep:${CROWD_RETRY_DELAYS_MS[0]}`, "stats:read"]);
    expect(crowd.status).toBe("ready");
    expect(crowd.stats.finishedPlayers).toBe(8);
    // 2 of 8 scored lower: 25%, in the share line and Crowd Showdown alike.
    expect(scoreLine(HP, rec, crowd)).toBe("5/10 ➜ Beat 25% of players");
    expect(crowdBeatPercent(crowdStatsFor(crowd, rec), rec.score)).toBe(25);
  });

  it("1b. rejects a read where others share your score but your game isn't counted yet", async () => {
    const rec = record("0001111100");
    const be = backend({ reads: [
      stats({ 4: 2, 5: 2, 7: 5 }, 5),  // baseline: two others at 5
      stats({ 4: 2, 5: 2, 7: 5 }, 5),  // unchanged: someone is at 5, but not you
      stats({ 4: 2, 5: 3, 7: 5 }, 5),  // you are counted
    ] });
    const crowd = await finish(rec, be);
    expect(be.fetchStats).toHaveBeenCalledTimes(3);
    expect(crowd.stats.finishedPlayers).toBe(10);
    expect(scoreLine(HP, rec, crowd)).toBe("5/10 ➜ Beat 20% of players");
  });

  it("uses only stats read after the save is confirmed", async () => {
    const rec = record("0001111100");
    const be = backend({ reads: [stats({ 4: 1 }, 5), stats({ 4: 1, 5: 1 }, 5)] });
    const crowd = await finish(rec, be);
    expect(be.log).toEqual(["stats:read", "save:start", "save:confirmed", "stats:read"]);
    expect(crowd.stats.scoreHistogram).toEqual({ 4: 1, 5: 1 });
  });

  it("2. uses stats that already include the result as-is, without counting it twice", async () => {
    const rec = record("0001111100");
    const be = backend({ reads: [
      stats({ 4: 2, 5: 2, 7: 5 }, 5),  // baseline: 9 others
      stats({ 4: 2, 5: 3, 7: 5 }, 5),  // you + 2 others at 5
    ] });
    const crowd = await finish(rec, be);
    expect(be.fetchStats).toHaveBeenCalledTimes(2);
    expect(crowd.stats.finishedPlayers).toBe(10); // not 11
    expect(crowd.stats.scoreHistogram).toEqual({ 4: 2, 5: 3, 7: 5 });
    expect(scoreLine(HP, rec, crowd)).toBe("5/10 ➜ Beat 20% of players");
  });

  it("2b. revisiting: stats that include the completed game are used as-is", async () => {
    const be = backend({ reads: [stats({ 4: 2, 5: 3, 7: 5 }, 5)] });
    const result = await loadCrowdStats({ fetchStats: be.fetchStats, score: 5, sleep: be.sleep });
    expect(result.stats.finishedPlayers).toBe(10);
    expect(be.fetchStats).toHaveBeenCalledTimes(1);
  });

  it("3. sole finisher: score only", async () => {
    const rec = record("0001111100");
    const crowd = await finish(rec, backend({ reads: [stats({}, 5), stats({ 5: 1 }, 5)] }));
    expect(crowd.status).toBe("ready");
    expect(scoreLine(HP, rec, crowd)).toBe("5/10");
  });

  it("4. lowest score with several finishers: Beat 0% of players", async () => {
    const rec = record("0000000000");
    const crowd = await finish(rec, backend({ reads: [stats({ 4: 2, 7: 5 }, 0), stats({ 0: 1, 4: 2, 7: 5 }, 0)] }));
    expect(scoreLine(HP, rec, crowd)).toBe("0/10 ➜ Beat 0% of players");
  });

  it("5. several players tied with you are never counted as beaten", async () => {
    const rec = record("0101110110"); // 6/10
    const crowd = await finish(rec, backend({ reads: [
      stats({ 2: 1, 5: 3, 6: 7, 9: 8 }, 6),
      stats({ 2: 1, 5: 3, 6: 8, 9: 8 }, 6),
    ] }));
    expect(scoreLine(HP, rec, crowd)).toBe("6/10 ➜ Beat 20% of players"); // 4 of 20
    expect(crowdBeatPercent(crowdStatsFor(crowd, rec), rec.score)).toBe(20); // Crowd Showdown too
  });

  it("6. unique perfect score: at most 99%, even if an early read had everyone below", async () => {
    const rec = record("111111111111111"); // 15/15
    const be = backend({ reads: [
      stats({ 8: 40, 12: 101 }, 15),        // baseline
      stats({ 8: 40, 12: 101 }, 15),        // early read: would have claimed 100%
      stats({ 8: 40, 12: 101, 15: 1 }, 15), // includes you
    ] });
    const crowd = await finish(rec, be);
    expect(scoreLine(HP, rec, crowd)).toBe("15/15 ➜ Beat 99% of players");
  });

  it("7. save failure: nothing read after it, score only, Crowd Showdown hidden", async () => {
    const rec = record("0001111100");
    const be = backend({ saveFails: true, reads: [stats({ 4: 2, 5: 3, 7: 5 }, 5)] });
    const crowd = await finish(rec, be);
    expect(crowd).toMatchObject({ status: "unavailable", reason: "save-failed" });
    expect(be.log).toEqual(["stats:read", "save:start", "save:failed"]);
    expect(scoreLine(HP, rec, crowd)).toBe("5/10");
  });

  it("8a. stats that never catch up: bounded reads, then score only", async () => {
    const rec = record("0001111100");
    const be = backend({ reads: [stats({ 4: 2, 5: 2, 7: 5 }, 5)] }); // never counts you
    const crowd = await finish(rec, be);
    expect(be.fetchStats).toHaveBeenCalledTimes(1 + CROWD_RETRY_DELAYS_MS.length + 1);
    expect(be.sleep.mock.calls.map(([ms]) => ms)).toEqual(CROWD_RETRY_DELAYS_MS);
    expect(crowd).toMatchObject({ status: "unavailable", reason: "stats-not-current" });
    expect(scoreLine(HP, rec, crowd)).toBe("5/10");
  });

  it("8b. stats requests that fail or return nothing: bounded reads, then score only", async () => {
    const rec = record("0001111100");
    for (const failure of [new Error("offline"), null]) {
      const be = backend({ reads: [failure] });
      const crowd = await finish(rec, be);
      expect(be.fetchStats).toHaveBeenCalledTimes(1 + CROWD_RETRY_DELAYS_MS.length + 1);
      expect(be.save).toHaveBeenCalledTimes(1); // a failed baseline never blocks the save
      expect(crowd).toMatchObject({ status: "unavailable", reason: "stats-failed" });
      expect(scoreLine(HP, rec, crowd)).toBe("5/10");
    }
  });

  it("8c. recovers from one failed read after the save", async () => {
    const rec = record("0001111100");
    const crowd = await finish(rec, backend({ reads: [stats({ 4: 2, 5: 2, 7: 5 }, 5), new Error("blip"), stats({ 4: 2, 5: 3, 7: 5 }, 5)] }));
    expect(crowd.status).toBe("ready");
  });

  it("8d. a failed baseline falls back to the revisit check", async () => {
    const rec = record("0001111100");
    const crowd = await finish(rec, backend({ reads: [new Error("baseline failed"), stats({ 4: 2, 5: 3, 7: 5 }, 5)] }));
    expect(crowd.status).toBe("ready");
    expect(scoreLine(HP, rec, crowd)).toBe("5/10 ➜ Beat 20% of players");
  });

  it("runs onSaved once the save is confirmed, and not after a failed save", async () => {
    const onSaved = vi.fn();
    const ok = backend({ reads: [stats({}, 5), stats({ 5: 1 }, 5)] });
    await saveThenLoadCrowdStats({ save: ok.save, fetchStats: ok.fetchStats, score: 5, sleep: ok.sleep, onSaved });
    expect(onSaved).toHaveBeenCalledTimes(1);
    const bad = backend({ saveFails: true, reads: [stats({}, 5)] });
    await saveThenLoadCrowdStats({ save: bad.save, fetchStats: bad.fetchStats, score: 5, sleep: bad.sleep, onSaved });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe("statsIncludeScore", () => {
  it("needs someone at the score and a histogram that matches the finisher count", () => {
    expect(statsIncludeScore(stats({ 4: 2, 5: 1 }, 5), 5)).toBe(true);
    expect(statsIncludeScore(stats({ 4: 2 }, 5), 5)).toBe(false);
    expect(statsIncludeScore({ finishedPlayers: 4, scoreHistogram: { 4: 2, 5: 1 } }, 5)).toBe(false);
    expect(statsIncludeScore({ finishedPlayers: 0, scoreHistogram: {} }, 5)).toBe(false);
    expect(statsIncludeScore(null, 5)).toBe(false);
  });

  it("with a baseline, needs one more finisher at the score and overall", () => {
    const base = stats({ 4: 2, 5: 2 }, 5);
    expect(statsIncludeScore(stats({ 4: 2, 5: 2 }, 5), 5, base)).toBe(false);
    expect(statsIncludeScore(stats({ 4: 3, 5: 2 }, 5), 5, base)).toBe(false); // someone else finished
    expect(statsIncludeScore(stats({ 4: 2, 5: 3 }, 5), 5, base)).toBe(true);
    expect(statsIncludeScore(stats({ 5: 1 }, 5), 5, stats({}, 5))).toBe(true);
  });
});

describe("9. Results and Home share the same text", () => {
  it("produces identical text from the same record and crowd stats", async () => {
    const rec = record("0001111100");
    const crowd = await finish(rec, backend({ reads: [stats({ 4: 2, 5: 2, 7: 5 }, 5), stats({ 4: 2, 5: 3, 7: 5 }, 5)] }));
    // Results passes its record and the app's crowd state; Home passes the
    // same completed record and the same crowd state.
    const results = shareTextFor(HP, { ...rec }, crowd);
    const home = shareTextFor(HP, { ...rec }, crowd);
    expect(home).toBe(results);
    expect(results).toBe(
      "Harry Potter Character 🧙‍♂️\nOR\nPro Hockey Player? 🏒\n🔴🔴🔴🟢🟢🟢🟢🟢🔴🔴\n5/10 ➜ Beat 20% of players\nwhatthefudgetrivia.com"
    );
  });

  it("ignores crowd stats loaded for a different day or score", () => {
    const rec = record("0001111100");
    const ready = { status: "ready", date: rec.date, score: rec.score, stats: stats({ 4: 2, 5: 3, 7: 5 }, 5) };
    expect(crowdHistogramFor(ready, rec)).toEqual({ 4: 2, 5: 3, 7: 5 });
    expect(crowdHistogramFor({ ...ready, date: "2026-09-26" }, rec)).toBeNull();
    expect(crowdHistogramFor({ ...ready, score: 6 }, rec)).toBeNull();
    expect(crowdHistogramFor(null, rec)).toBeNull();
  });
});

// Crowd Showdown ("You beat N% of players.") and the share line ("Beat N% of
// players") must always show the same number.
describe("10. Crowd Showdown and the share line use one strictly-lower percentage", () => {
  const ready = (rec, histogram) => ({ status: "ready", date: rec.date, score: rec.score, stats: stats(histogram) });
  const both = (rec, crowd) => ({
    share: scoreLine(HP, rec, crowd),
    showdown: crowdBeatPercent(crowdStatsFor(crowd, rec), rec.score),
  });

  it("Mario Kart: 51 finishers, three at 8/8, 48 lower: 94% in both", async () => {
    const rec = record("11111111"); // 8/8
    const crowd = await finish(rec, backend({ reads: [
      stats({ 3: 10, 5: 18, 7: 20, 8: 2 }), // baseline: 50 others, two already at 8/8
      stats({ 3: 10, 5: 18, 7: 20, 8: 3 }), // you counted: 51
    ] }));
    expect(crowd.stats.finishedPlayers).toBe(51);
    expect(both(rec, crowd)).toEqual({ share: "8/8 ➜ Beat 94% of players", showdown: 94 }); // floor(48/51)
    expect(shareTextFor(HP, { ...rec }, crowd)).toBe(shareTextFor(HP, rec, crowd)); // Results and Home
  });

  it("only finisher: no comparison anywhere", () => {
    const rec = record("11111111");
    expect(both(rec, ready(rec, { 8: 1 }))).toEqual({ share: "8/8", showdown: null });
  });

  it("several finishers, nobody lower: 0%", () => {
    const rec = record("00000000");
    expect(both(rec, ready(rec, { 0: 1, 4: 3, 8: 2 }))).toEqual({ share: "0/8 ➜ Beat 0% of players", showdown: 0 });
  });

  it("unique top score: capped at 99%, never 100%", () => {
    const rec = record("11111111");
    expect(both(rec, ready(rec, { 2: 150, 5: 249, 8: 1 }))).toEqual({ share: "8/8 ➜ Beat 99% of players", showdown: 99 });
  });

  it("tied top score: everyone tied is left out", () => {
    const rec = record("11111111");
    // 10 finishers: 6 lower, 4 tied at 8/8 (you included).
    expect(both(rec, ready(rec, { 4: 6, 8: 4 }))).toEqual({ share: "8/8 ➜ Beat 60% of players", showdown: 60 });
  });

  it("middle score", () => {
    const rec = record("11110000"); // 4/8
    // 20 finishers: 5 lower, 6 at 4/8, 9 higher.
    expect(both(rec, ready(rec, { 2: 5, 4: 6, 7: 9 }))).toEqual({ share: "4/8 ➜ Beat 25% of players", showdown: 25 });
  });

  it("missing stats: no comparison", () => {
    const rec = record("11110000");
    expect(both(rec, null)).toEqual({ share: "4/8", showdown: null });
    expect(both(rec, { status: "unavailable", reason: "stats-failed" })).toEqual({ share: "4/8", showdown: null });
    expect(crowdBeatPercent(null, 4)).toBeNull();
    expect(crowdBeatPercent({ finishedPlayers: 0, scoreHistogram: {} }, 4)).toBeNull();
  });

  it("inconsistent stats: no comparison", () => {
    // Histogram says 11 players, the finisher count says 12.
    expect(crowdBeatPercent({ finishedPlayers: 12, scoreHistogram: { 2: 5, 4: 6 } }, 4)).toBeNull();
    // Nobody at your score (you aren't counted).
    expect(crowdBeatPercent(stats({ 2: 5, 7: 9 }), 4)).toBeNull();
    // Missing histogram.
    expect(crowdBeatPercent({ finishedPlayers: 12 }, 4)).toBeNull();
  });
});

// Replay and Admin Preview scores are never saved, so the stats never count
// them: compare against all historical finishers, no exact-score bucket.
describe("11. Replay / Admin Preview: strictly lower than all historical finishers", () => {
  const unsaved = (stats, score) => crowdBeatPercent(stats, score, { saved: false });

  it("Admin Preview 6/13 with nobody at 6 still gets a percentage", () => {
    // 21 historical finishers: 11 below 6, none at 6, 10 above.
    const history = stats({ 2: 5, 4: 6, 7: 9, 13: 1 });
    expect(unsaved(history, 6)).toBe(52); // floor(11/21)
    expect(crowdBeatPercent(history, 6)).toBeNull(); // a saved daily result would still be refused
  });

  it("Mario Kart history, replayed at 8/8: 48 of 51 lower, 94%", () => {
    expect(unsaved(stats({ 3: 10, 5: 18, 7: 20, 8: 3 }), 8)).toBe(94);
  });

  it("players tied with the replay score are not beaten", () => {
    expect(unsaved(stats({ 2: 6, 6: 4 }), 6)).toBe(60); // 6 of 10
  });

  it("above every historical finisher: capped at 99, never 100", () => {
    expect(unsaved(stats({ 2: 40, 9: 60 }), 13)).toBe(99);
    expect(unsaved(stats({ 4: 1 }), 13)).toBe(99); // one historical finisher is enough
  });

  it("below everyone: 0%", () => {
    expect(unsaved(stats({ 4: 3, 9: 2 }), 1)).toBe(0);
  });

  it("no usable historical stats: hidden", () => {
    expect(unsaved(null, 6)).toBeNull();
    expect(unsaved(stats({}), 6)).toBeNull(); // nobody has finished yet
    expect(unsaved({ finishedPlayers: 0, averageScore: 0, scoreHistogram: {} }, 6)).toBeNull();
    expect(unsaved({ finishedPlayers: 5 }, 6)).toBeNull(); // no histogram
  });

  it("inconsistent histogram: hidden", () => {
    expect(unsaved({ finishedPlayers: 22, scoreHistogram: { 2: 5, 4: 6, 7: 9, 13: 1 } }, 6)).toBeNull();
  });
});
