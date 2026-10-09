import { shiftDay } from "./schedule.js";

// The player's streak and totals after finishing the daily puzzle dated
// `date`. Streaks count puzzle days, never the clock: finishing Oct 8's
// puzzle after midnight still follows on from a play on Oct 7. Returns a
// new object; `stats` is left alone.
export function statsAfterFinish(stats, { date, score, totalQuestions, bestCombo }) {
  const s = { ...stats };
  const dayBefore = shiftDay(date, -1);
  if (dayBefore && s.lastPlayedDate === dayBefore) s.currentStreak += 1;
  else if (s.lastPlayedDate !== date) s.currentStreak = 1;
  s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
  s.lastPlayedDate = date;
  s.totalPlayed += 1;
  s.totalCorrect += score;
  s.totalQuestions += totalQuestions;
  if (bestCombo > s.bestCombo) s.bestCombo = bestCombo;
  return s;
}
