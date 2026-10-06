// Home's Up Next: which puzzle comes after today's, and how long until it
// opens. Pure functions, so the choice and the countdown can be tested.
//
// The release rule is the app's own (getLocalGameDay in App.jsx): a puzzle
// belongs to a calendar day in the player's local time zone, so the puzzle
// dated D opens at local midnight starting D, the same moment the Results
// countdown counts down to.

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

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
