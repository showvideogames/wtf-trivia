import { createContext } from "react";

// A display-only streak for the QA route /streak-lab (StreakLab.jsx). Null
// everywhere else, so Home shows the player's real streak. Only the Home
// streak display reads it; nothing is saved from it.
export const StreakOverrideContext = createContext(null);

// The quick values the lab offers.
export const LAB_QUICK_VALUES = [1, 10, 25, 50, 75, 90, 95, 100, 101, 150, 200, 201, 300, 301, 1000];

export const LAB_MAX_STREAK = 999999;

// A streak from text (the input or ?streak=): a whole number from 0 up, or
// null when it isn't one. Larger values are held at LAB_MAX_STREAK.
export function parseLabStreak(text) {
  const s = String(text ?? "").trim();
  if (!/^\d{1,12}$/.test(s)) return null;
  return Math.min(Number(s), LAB_MAX_STREAK);
}
