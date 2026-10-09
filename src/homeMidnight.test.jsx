// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { demoGame } from "./dev/offlineBackend.js";

// The whole app across midnight, offline (the dev backend, never a
// database), with two fixed puzzles: Oct 8 (today) and Oct 9 (tomorrow).
// Each case renders the whole app, so it gets more than the default 5s.
// A session that started or finished Oct 8 keeps it -- the game, its save,
// streak, Results and Share -- through the opening and unrelated updates
// until PLAY NOW reloads (dailySession.js); a Home with nothing played rolls
// over to the new day as always, and a new page load always opens the new day.

vi.stubEnv("VITE_SUPABASE_URL", "");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
vi.stubEnv("VITE_PLATFORM_DISCOVERY_URL", "");
vi.mock("./dev/offlineBackend.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    demoGames: () => {
      const base = real.demoGame();
      return [
        { ...base, id: "t-oct8", date: "2026-10-08", themeTitle: "Oct 8 Puzzle" },
        { ...base, id: "t-oct9", date: "2026-10-09", themeTitle: "Oct 9 Puzzle" },
      ];
    },
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const RECORD_KEY = "wtf-dev-records-by-puzzle";
const STATS_KEY = "wtf-dev-stats";
const LOG_KEY = "wtf-dev-log";

let root = null;
let host = null;
let reload = null;
const realLocation = window.location;

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function mountApp() {
  const { default: App } = await import("./App.jsx");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<App/>));
  await flush(50);
  await flush(500);
}
function unmountApp() {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
}
const text = () => host.textContent;
const playNow = () => host.querySelector(".hm-next-play");
const click = (el) => act(() => el.click());

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 8, 23, 59, 50), toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  localStorage.clear();
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  window.AudioContext = class {
    constructor() { this.currentTime = 0; this.destination = {}; this.state = "running"; }
    resume() { return Promise.resolve(); }
    createOscillator() { const p = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; return { type: "", frequency: p, connect() {}, start() {}, stop() {} }; }
    createGain() { const p = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; return { gain: p, connect() {} }; }
  };
  reload = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, href: realLocation.href, pathname: "/", search: "", hash: "", reload } });
});
afterEach(() => {
  unmountApp();
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  vi.useRealTimers();
});

function finishOct8() {
  localStorage.setItem(RECORD_KEY, JSON.stringify({
    "t-oct8": { puzzleId: "t-oct8", date: "2026-10-08", themeTitle: "Oct 8 Puzzle", answers: [], score: 6, totalQuestions: 8, currentIndex: 8, completed: true, startedAt: "2026-10-08T20:00:00Z", completedAt: "2026-10-08T20:10:00Z" },
  }));
}

describe("Home across midnight", () => {
  it("a finished Home holds through PLAY NOW and unrelated updates, then reloads into the new day", async () => {
    finishOct8();
    await mountApp();
    // Before midnight: today finished, tomorrow counting down.
    expect(text()).toContain("Today’s puzzle · Completed");
    expect(text()).toContain("Tomorrow’s puzzle");
    expect(host.querySelector('[role="timer"]')).not.toBeNull();

    // 1. 00:00 arrives: PLAY NOW.
    await flush(11_000);
    expect(new Date().toLocaleDateString("en-CA")).toBe("2026-10-09");
    expect(playNow()?.textContent).toBe("Play now");
    expect(host.querySelector('[role="timer"]')).toBeNull();

    // 2. Unrelated updates: sound off and on, How to Play open and closed.
    click(host.querySelector('button[aria-label="Turn sound off"]'));
    await flush(100);
    click(host.querySelector('button[aria-label="Turn sound on"]'));
    await flush(100);
    click([...host.querySelectorAll(".sh-link")].find((b) => b.textContent === "How to Play"));
    await flush(100);
    expect(document.querySelector(".htp-modal")).not.toBeNull();
    click(document.querySelector(".htp-play"));
    await flush(3000);

    // 3. Still the finished Oct 8 page with PLAY NOW; not the loading page, not the new day.
    expect(text()).toContain("Today’s puzzle · Completed");
    expect(text()).toContain("You got");
    expect(text()).toContain("Tomorrow’s puzzle");
    expect(playNow()).not.toBeNull();
    expect(host.querySelector(".hm-play")).toBeNull();
    expect(reload).not.toHaveBeenCalled();

    // 4. PLAY NOW only reloads; after the reload the new day shows, unfinished,
    //    with nothing about the next puzzle.
    click(playNow());
    expect(reload).toHaveBeenCalledTimes(1);
    unmountApp();
    await mountApp();
    expect(text()).toContain("PLAY TODAY’S PUZZLE");
    expect(text()).not.toContain("Completed");
    expect(host.querySelector(".hm-next")).toBeNull();
    expect(host.querySelector(".hm-artwork img, .hm-matchup")).not.toBeNull();
  }, 30_000);

  it("an unfinished Home still rolls over to the new day as usual", async () => {
    await mountApp();
    expect(text()).toContain("PLAY TODAY’S PUZZLE");
    expect(host.querySelector(".hm-next")).toBeNull(); // nothing about tomorrow before today is done
    await flush(11_000);
    // Any update after midnight shows the new day: Oct 8 is not held.
    click(host.querySelector('button[aria-label="Turn sound off"]'));
    await flush(1000);
    expect(host.querySelector(".hm-next-play")).toBeNull();
    expect(text()).toContain("PLAY TODAY’S PUZZLE");
    expect(host.querySelector(".hm-artwork img")?.getAttribute("alt") || host.querySelector(".hm-title")?.textContent).toContain("Oct 9");
  }, 30_000);
});

// ---- A DAILY GAME ACROSS MIDNIGHT ----
const QUESTIONS = demoGame().questions;
const stored = (key, fallback) => JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
const records = () => stored(RECORD_KEY, {});
const homeTitle = () => host.querySelector(".hm-artwork img")?.getAttribute("alt") || host.querySelector(".hm-title")?.textContent || "";
const prompt = () => host.querySelector(".gp-prompt, .gp-clue-text")?.textContent;
const button = (label) => [...host.querySelectorAll("button")].find((b) => b.textContent.includes(label));
const loadingPage = () => text().includes("Mixing today") || text().includes("Couldn't connect");
const toggleSound = async () => {
  click(host.querySelector('button[aria-label="Turn sound off"]'));
  await flush(100);
  click(host.querySelector('button[aria-label="Turn sound on"]'));
  await flush(100);
};
const nav = async (label) => {
  click([...host.querySelectorAll(".sh-link")].find((b) => b.textContent === label));
  await flush(1000);
};
const archiveCard = (title) => [...host.querySelectorAll(".arc-card")].find((c) => c.querySelector(".arc-card-title")?.textContent === title);
const archiveToday = () => [...host.querySelectorAll(".arc-card")].find((c) => c.querySelector(".arc-tag")?.textContent === "Today");
async function answerQuestion() {
  click(host.querySelector(".ans-box"));
  await flush(400);
  click(host.querySelector(".gp-next"));
  await flush(200);
}
function seedStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify({ currentStreak: 3, longestStreak: 3, lastPlayedDate: "2026-10-07", totalPlayed: 3, totalCorrect: 20, totalQuestions: 24, bestCombo: 3 }));
}
function startedOct8(answered) {
  localStorage.setItem(RECORD_KEY, JSON.stringify({
    "t-oct8": { puzzleId: "t-oct8", date: "2026-10-08", themeTitle: "Oct 8 Puzzle", answers: QUESTIONS.slice(0, answered).map((q, i) => ({ questionIndex: i, chosenCategory: q.correctCategory, correct: true })), score: answered, totalQuestions: QUESTIONS.length, currentIndex: answered, completed: false, startedAt: "2026-10-08T20:00:00Z", completedAt: null },
  }));
}

describe("A daily game across midnight", () => {
  it("a game started before midnight stays Oct 8's, saves as Oct 8 and keeps the streak (Scenario A)", async () => {
    seedStats();
    await mountApp();
    expect(homeTitle()).toContain("Oct 8");
    click(button("PLAY TODAY’S PUZZLE"));
    await flush(200);
    expect(prompt()).toBe(QUESTIONS[0].itemText);
    await answerQuestion();
    await answerQuestion();

    // Midnight passes mid-game; answer saves and sound toggles re-render the app.
    await flush(11_000);
    expect(new Date().toLocaleDateString("en-CA")).toBe("2026-10-09");
    await toggleSound();
    expect(prompt()).toBe(QUESTIONS[2].itemText); // the same game, same place
    await answerQuestion();
    expect(prompt()).toBe(QUESTIONS[3].itemText);
    expect(loadingPage()).toBe(false);

    for (let i = 3; i < QUESTIONS.length; i++) await answerQuestion();
    await flush(1000);

    // Saved once, as Oct 8's puzzle; nothing is written for Oct 9.
    expect(Object.keys(records())).toEqual(["t-oct8"]);
    expect(records()["t-oct8"]).toMatchObject({ date: "2026-10-08", completed: true, currentIndex: QUESTIONS.length });
    expect(stored(LOG_KEY, []).filter((e) => e === "save:confirmed")).toHaveLength(1);
    expect(stored(STATS_KEY, {})).toMatchObject({ lastPlayedDate: "2026-10-08", currentStreak: 4, totalPlayed: 4 });

    // Results are Oct 8's: its share text links Oct 8's puzzle, and the next
    // game is already open (the countdown is at zero, not tomorrow night).
    expect(text()).toContain("Back to home");
    expect(host.querySelector(".cdown-time")?.textContent).toBe("00:00:00");
    click(button("Preview share text"));
    await flush(100);
    expect(text()).toContain("/puzzle/t-oct8");
    expect(text()).not.toContain("t-oct9");

    // The Archive meanwhile treats Oct 9 as today.
    await nav("Archive");
    expect(archiveToday()?.querySelector(".arc-card-title")?.textContent).toBe("Oct 9 Puzzle");

    // Home: Oct 8 completed with PLAY NOW for Oct 9; PLAY NOW moves on.
    await nav("Play");
    expect(text()).toContain("Today’s puzzle · Completed");
    expect(homeTitle()).toContain("Oct 8");
    expect(reload).not.toHaveBeenCalled();
    click(playNow());
    expect(reload).toHaveBeenCalledTimes(1);
    unmountApp();
    await mountApp();
    expect(homeTitle()).toContain("Oct 9");
    expect(text()).toContain("PLAY TODAY’S PUZZLE");
    expect(stored(STATS_KEY, {})).toMatchObject({ lastPlayedDate: "2026-10-08", currentStreak: 4, totalPlayed: 4 });
  }, 60_000);

  it("Results of a game finished before midnight stay put, with Share still for Oct 8 (Scenario B)", async () => {
    finishOct8();
    await mountApp();
    click(button("See my results"));
    await flush(500);
    expect(text()).toContain("Back to home");
    expect(host.querySelector(".cdown-time")?.textContent).not.toBe("00:00:00");

    await flush(11_000);
    await toggleSound();
    await flush(3000);
    expect(loadingPage()).toBe(false);
    expect(text()).toContain("Back to home");
    expect(host.querySelector(".cdown-time")?.textContent).toBe("00:00:00");
    click(button("Preview share text"));
    await flush(100);
    expect(text()).toContain("/puzzle/t-oct8");
    expect(Object.keys(records())).toEqual(["t-oct8"]);
    expect(reload).not.toHaveBeenCalled();
  }, 30_000);

  it("an unfinished game left on Home keeps its day and resumes where it was", async () => {
    startedOct8(2);
    await mountApp();
    expect(text()).toContain("KEEP GOING!");
    await flush(11_000);
    await toggleSound();
    await flush(1000);
    expect(loadingPage()).toBe(false);
    expect(homeTitle()).toContain("Oct 8");
    expect(text()).toContain(`2 of ${QUESTIONS.length} answered`);
    click(button("KEEP GOING!"));
    await flush(200);
    expect(prompt()).toBe(QUESTIONS[2].itemText);
    expect(Object.keys(records())).toEqual(["t-oct8"]);
  }, 30_000);

  it("past midnight the Archive knows Oct 9, Home keeps finished Oct 8 until Oct 9 is started from it", async () => {
    finishOct8();
    await mountApp();
    await flush(11_000);
    await toggleSound();

    // The Archive goes by the clock: Oct 9 is out and is Today.
    await nav("Archive");
    expect(archiveToday()?.querySelector(".arc-card-title")?.textContent).toBe("Oct 9 Puzzle");
    expect(archiveCard("Oct 8 Puzzle")?.textContent).toContain("6 / 8"); // Oct 8's own score

    // Back on Home, the session still holds Oct 8, finished, with PLAY NOW.
    await nav("Play");
    expect(text()).toContain("Today’s puzzle · Completed");
    expect(homeTitle()).toContain("Oct 8");
    expect(playNow()).not.toBeNull();

    // The Archive's Today card starts Oct 9 in place: the session moves on.
    await nav("Archive");
    click(archiveToday().querySelector(".arc-action"));
    await flush(500);
    expect(prompt()).toBe(QUESTIONS[0].itemText);
    expect(records()["t-oct9"]).toMatchObject({ date: "2026-10-09", completed: false });
    expect(records()["t-oct8"]).toMatchObject({ date: "2026-10-08", completed: true, score: 6 });
    await answerQuestion();
    await nav("Play");
    expect(homeTitle()).toContain("Oct 9");
    expect(text()).toContain(`1 of ${QUESTIONS.length} answered`);
    expect(loadingPage()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  }, 30_000);

  it("a fresh page load after midnight opens the new day, not yesterday's game (Scenario C)", async () => {
    vi.setSystemTime(new Date(2026, 9, 9, 0, 10));
    for (const seed of [() => startedOct8(2), finishOct8]) {
      localStorage.clear();
      seed();
      await mountApp();
      expect(homeTitle()).toContain("Oct 9");
      expect(text()).toContain("PLAY TODAY’S PUZZLE");
      expect(text()).not.toContain("KEEP GOING!");
      expect(text()).not.toContain("Completed");
      unmountApp();
    }
  }, 30_000);
});
