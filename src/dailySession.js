// ---- THE DAILY SESSION'S GAME DAY ----
// App keeps two game days, both by the release rule's own calendar
// (schedule.js gameDayKey):
// - the live day: the clock's, for every date-aware screen that isn't the
//   daily session (the Archive and its Today card, Replay);
// - the session day: the day of the daily puzzle this page's session plays
//   (Home, the daily game, its Results and Share). It is captured when the
//   page loads and stays put across midnight while the session owns that
//   day's puzzle:
//     - the daily game is on screen, or
//     - the player's record for it is started (any answer) or finished.
// So a game in progress past midnight stays the same game, finishes as that
// day's puzzle (its record, its streak date) and its Results and Share keep
// working; a finished Home keeps showing it, with the next puzzle's countdown
// turning into PLAY NOW, which reloads the page. Meanwhile the Archive
// already shows the new day, and starting its Today card moves the session
// on. Otherwise -- nothing played yet, or no puzzle that day -- the session
// day follows the clock as before. A page load always starts from the
// current day, so a new visit never opens a previous day's puzzle.

// The game day for this render: `gameDay` (the one held), `liveDay` (the
// clock's), and what the page shows of the held day's puzzle: `view` and
// the player's `record` for it (null when there is none).
export function sessionGameDay({ gameDay, liveDay, view, record }) {
  if (gameDay === liveDay) return gameDay;
  const owned = view === "game" || Boolean(record && (record.completed || record.answers?.length > 0));
  return owned ? gameDay : liveDay;
}
