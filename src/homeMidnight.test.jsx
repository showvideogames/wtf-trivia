// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// The whole app across midnight, offline (the dev backend, never a
// database), with two fixed puzzles: Oct 8 (today) and Oct 9 (tomorrow).
// Each case renders the whole app, so it gets more than the default 5s.
// A finished Home holds through the opening and unrelated updates until
// PLAY NOW reloads; an unfinished one rolls over to the new day as always.

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
