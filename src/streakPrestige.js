// The Home streak display, as pure maths. The player's real streak (stats'
// currentStreak) is never touched: it keeps counting forever, and the display
// derives everything from it. The big number runs 1-100 and starts over;
// each completed lap is a prestige. Size follows the number alone, never the
// prestige, so day 101 is as small as day 1; prestige changes only the look.

export const CYCLE_LENGTH = 100;

// Day 1 of a lap, and (on a wide screen) day 100. The component caps the
// largest size to the viewport so three digits never overflow.
export const STREAK_MIN_PX = 30;
export const STREAK_MAX_PX = 480;

// Growth with t = progress through the lap (0 on day 1, 1 on day 100): half
// steady, so even a few days in is visibly bigger, half a high power that
// stays quiet until the last stretch and then runs away. At the 480px
// maximum that is about 39px on day 5, 50 on day 10, 84 on day 25, 145 on
// day 50, 237 on day 75, 351 on day 90, 408 on day 95, 480 on day 100.
// Screens too narrow for that size cap it (see homePage.css).
export const LINEAR_SHARE = 0.5;
export const LATE_EXPONENT = 6;

// 1 -> day 1 of prestige 0; 100 -> day 100 of prestige 0 (the climax, no
// prestige yet); 101 -> day 1 of prestige 1. Anything that isn't a streak of
// at least one day (0, negative, NaN, undefined) has no display: cycleDay 0.
export function streakCycle(actual) {
  const raw = Math.floor(Number(actual));
  const n = Math.min(raw, Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(raw) || n < 1) return { actual: 0, cycleDay: 0, prestigeCount: 0 };
  return {
    actual: n,
    cycleDay: ((n - 1) % CYCLE_LENGTH) + 1,
    prestigeCount: Math.floor((n - 1) / CYCLE_LENGTH),
  };
}

// 0 on day 1 up to 1 on day 100.
export function streakGrowth(cycleDay) {
  const d = Math.min(CYCLE_LENGTH, Math.max(1, Number(cycleDay) || 1));
  const t = (d - 1) / (CYCLE_LENGTH - 1);
  return LINEAR_SHARE * t + (1 - LINEAR_SHARE) * t ** LATE_EXPONENT;
}

// Font size in px for a lap day, between STREAK_MIN_PX and `maxPx`.
export function streakFontPx(cycleDay, maxPx = STREAK_MAX_PX) {
  return STREAK_MIN_PX + (maxPx - STREAK_MIN_PX) * streakGrowth(cycleDay);
}

// Phones can't show the big end of the curve at full height without the
// number being wider than the screen, and capping the size would flatten the
// last days into one. So narrow screens keep the curve exactly up to the knee
// (day 50) and take a smaller, still strictly rising share of everything above
// it; whatever is still too wide is squashed horizontally (streakSqueeze), so
// every day is taller than the one before at every width.
export const LATE_KNEE_PX = 145;
export const NARROW_LATE_SHARE = 0.6;

// Font size for a lap day on a viewport `viewportW` px wide.
export function streakFontForWidth(cycleDay, viewportW) {
  const base = streakFontPx(cycleDay);
  if (base <= LATE_KNEE_PX) return base;
  const share = Math.min(1, Math.max(NARROW_LATE_SHARE, ((Number(viewportW) || 0) - 24) / 600));
  return LATE_KNEE_PX + (base - LATE_KNEE_PX) * share;
}

// Horizontal scale (1 = natural) that fits a number `naturalEm` ems wide, at
// `fontPx`, into `availW` px.
export function streakSqueeze(fontPx, naturalEm, availW) {
  const natural = fontPx * naturalEm;
  return natural > availW && natural > 0 ? Math.max(0.05, availW / natural) : 1;
}

// Prestige looks, by lap. Add a theme by adding a row here and a
// `.hm-sk[data-theme="..."]` block in homePage.css. Past the last one the
// looks repeat from gold.
export const PRESTIGE_THEMES = ["classic", "gold", "platinum", "fudge", "candy"];

export function prestigeTheme(prestigeCount) {
  const n = Math.max(0, Math.floor(Number(prestigeCount)) || 0);
  if (n < PRESTIGE_THEMES.length) return PRESTIGE_THEMES[n];
  return PRESTIGE_THEMES[1 + ((n - 1) % (PRESTIGE_THEMES.length - 1))];
}

// Up to this many prestiges get a medal each; more collapse to "medal x N".
export const MAX_INDIVIDUAL_MEDALS = 3;

export function totalStreakText(actual) {
  return `${streakCycle(actual).actual.toLocaleString("en-US")}-day total streak`;
}
