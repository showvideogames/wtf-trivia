// ---- COMPLETED HOME OVER MIDNIGHT ----
// Once today's puzzle is finished, Home shows it (and its Results), then the
// next puzzle with a countdown that becomes PLAY NOW at the opening. That
// page must not swap itself for the new day: the player may still be looking
// at the result, and PLAY NOW (a page reload) is how they move on. Every
// other screen keeps the normal current day.
//
// So while Home or Results shows today's finished puzzle with a next one to
// come, App keeps a snapshot of what it shows (the hold). If the day then
// rolls over while the player stays on Home or Results, those two keep
// showing the snapshot -- unrelated updates (sound, How to Play, the menu,
// a data reload) can't replace it -- until PLAY NOW reloads the page.
// Leaving for any other screen drops the hold, and the new day applies as
// usual. Only a finished puzzle is ever held, so an unfinished one never
// stays playable as today's daily past midnight, and nothing about play,
// scores or streaks changes.

const HOLD_VIEWS = new Set(["home", "score"]);

// The hold after this render. `live` is what the app would show now:
// { view, day, game, record, upNext }.
export function nextHomeHold(hold, live) {
  const inFlow = HOLD_VIEWS.has(live.view);
  if (inFlow && live.record?.completed && live.upNext) {
    if (hold && hold.day === live.day && hold.game === live.game && hold.record === live.record && hold.upNext === live.upNext) return hold;
    return { day: live.day, game: live.game, record: live.record, upNext: live.upNext };
  }
  if (!hold || !inFlow || hold.day === live.day) return null;
  return hold;
}

// Whether Home and Results show the held puzzle rather than the live day.
export function isHoldingHome(hold, live) {
  return Boolean(hold) && HOLD_VIEWS.has(live.view) && hold.day !== live.day;
}
