// The puzzle schedule, in one place: today's game day, which puzzles are
// released (playable), which comes next (Home's Up Next) and how long until
// it opens. Pure functions, so every rule can be tested.
//
// The release rule: a puzzle belongs to a calendar day in the player's local
// time zone, so the puzzle dated D opens at local midnight starting D. Home's
// Play, the Archive, Replay, the Up Next countdown and the Results countdown
// all go by this same day.

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Today's game day in the player's local time zone, as YYYY-MM-DD.
export function gameDayKey(now = new Date()) {
  return now.toLocaleDateString("en-CA");
}

// Whether players may play this puzzle on `today`: published, with a real
// date, and that date is today or earlier. Drafts, retired puzzles and
// published puzzles scheduled after today are never playable, whatever
// screen asks. (Admin Preview plays the editor's copy and never asks.)
export function isReleased(game, today) {
  return game?.status === "published"
    && typeof game.date === "string" && DAY_KEY.test(game.date)
    && typeof today === "string" && game.date <= today;
}

// The soonest published puzzle dated after `today` (a YYYY-MM-DD key), or
// null. Drafts and retired puzzles never count, whatever their date. Two
// published puzzles can't share a date in the database; if they ever did,
// the order is still fixed (by id).
export function nextPuzzle(games, today) {
  if (!Array.isArray(games) || typeof today !== "string") return null;
  let best = null;
  for (const g of games) {
    if (g?.status !== "published" || typeof g.date !== "string" || !DAY_KEY.test(g.date)) continue;
    if (g.date <= today) continue;
    if (!best || g.date < best.date || (g.date === best.date && String(g.id) < String(best.id))) best = g;
  }
  return best;
}

// The moment the puzzle dated `day` opens: local midnight at its start.
// Null for anything that isn't a real YYYY-MM-DD date.
export function releaseTime(day) {
  const m = DAY_KEY.exec(String(day || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return at.getFullYear() === y && at.getMonth() === mo - 1 && at.getDate() === d ? at : null;
}

// Milliseconds left, split for display. Never negative.
export function countdownParts(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const two = (n) => String(n).padStart(2, "0");

// The countdown's groups, biggest first: days only when there is at least
// one, then hours, minutes and seconds, each two digits ("05", "09").
export function countdownGroups(ms) {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  const groups = [
    { unit: "hrs", value: two(hours) },
    { unit: "min", value: two(minutes) },
    { unit: "sec", value: two(seconds) },
  ];
  return days > 0 ? [{ unit: days === 1 ? "day" : "days", value: String(days) }, ...groups] : groups;
}

// How close the opening is, for the countdown's colour: "calm" while more
// than an hour is left, "close" inside the last hour, "soon" inside the last
// ten minutes, and "open" at zero.
export function countdownTier(ms) {
  const left = Number(ms) || 0;
  if (left <= 0) return "open";
  if (left < 10 * 60 * 1000) return "soon";
  if (left < 60 * 60 * 1000) return "close";
  return "calm";
}

// The same time in words for screen readers, to the minute (seconds would
// change on every announcement): "1 day, 4 hours and 3 minutes".
export function countdownWords(ms) {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  const word = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const parts = [];
  if (days) parts.push(word(days, "day"));
  if (hours) parts.push(word(hours, "hour"));
  if (minutes) parts.push(word(minutes, "minute"));
  else if (!parts.length) parts.push(seconds ? "less than a minute" : "0 minutes");
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}
