// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { resultCode, resultPath } from "./shareLink.js";

// Public quiz links (/quiz/<slug>, quizSlug.js) in the whole app, offline
// (the dev backend, never a database), on jsdom's real history. Today is
// Oct 8. The puzzles cover each case: today's, earlier ones (two sharing a
// title), one whose stored slug no longer matches its title, a draft and
// one scheduled later.

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
        { ...base, id: "t-oct7", date: "2026-10-07", themeTitle: "Oct 7 Puzzle" },
        { ...base, id: "t-cats-b", date: "2026-10-06", themeTitle: "Cats or Dogs?" },
        { ...base, id: "t-cats-a", date: "2026-10-05", themeTitle: "Cats or Dogs?" },
        { ...base, id: "t-stored", date: "2026-10-04", themeTitle: "A Renamed Title", slug: "the-original-name", slugColumn: true },
        { ...base, id: "t-draft", date: "2026-10-03", themeTitle: "Secret Draft", status: "draft" },
        { ...base, id: "t-future", date: "2026-10-20", themeTitle: "Future Puzzle" },
      ];
    },
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const RECORD_KEY = "wtf-dev-records-by-puzzle";

let root = null;
let host = null;

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
// Opens the app at `path`, as a direct link or a refresh would.
async function openAt(path) {
  unmountApp();
  if (path) window.history.replaceState(null, "", path);
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
const refresh = () => openAt(null);
const text = () => host.textContent;
const path = () => window.location.pathname;
const click = (el) => act(() => el.click());
const nav = async (label) => { click([...host.querySelectorAll(".sh-link")].find((a) => a.textContent === label)); await flush(300); };
const back = async () => { act(() => window.history.back()); await flush(300); };
const forward = async () => { act(() => window.history.forward()); await flush(300); };

// What the page shows.
const isReplayPage = (date) => text().includes(`Puzzle from`) && text().includes("PLAY THIS PUZZLE") && (!date || text().includes(date));
const isUnavailable = () => text().includes("This one isn’t ready to play.");
const isTodayHome = () => text().includes("PLAY TODAY’S PUZZLE");
const inGame = () => Boolean(host.querySelector(".gp-prompt, .gp-clue-text"));
const archiveLinks = () => [...host.querySelectorAll(".arc-card-link")].map((a) => [a.textContent, a.getAttribute("href")]);
const cardLink = (title) => [...host.querySelectorAll(".arc-card-link")].find((a) => a.textContent === title);

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 8, 12, 0, 0), toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  localStorage.clear();
  sessionStorage.clear();
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
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  unmountApp();
  vi.useRealTimers();
});

describe("/quiz/<slug> opens that exact quiz", () => {
  it("an earlier quiz opens its replay page, and a refresh stays on it", async () => {
    await openAt("/quiz/oct-7-puzzle");
    expect(isReplayPage()).toBe(true);
    expect(document.title).toContain("Oct 7 Puzzle");
    await refresh();
    expect(path()).toBe("/quiz/oct-7-puzzle");
    expect(isReplayPage()).toBe(true);
  }, 30_000);

  it("today's quiz is Home itself, playable and scored as usual", async () => {
    await openAt("/quiz/oct-8-puzzle");
    expect(isTodayHome()).toBe(true);
    click([...host.querySelectorAll("button")].find((b) => b.textContent.includes("PLAY TODAY’S PUZZLE")));
    await flush(500);
    expect(inGame()).toBe(true);
    expect(path()).toBe("/quiz/oct-8-puzzle");
    expect(JSON.parse(localStorage.getItem(RECORD_KEY))["t-oct8"]).toMatchObject({ completed: false });
  }, 30_000);

  it("two quizzes with the same title each open by their own slug", async () => {
    await openAt("/quiz/cats-or-dogs");
    expect(isReplayPage("Oct 5")).toBe(true);
    await openAt("/quiz/cats-or-dogs-2");
    expect(isReplayPage("Oct 6")).toBe(true);
  }, 30_000);

  it("an existing quiz opens by its stored slug, not by its current title", async () => {
    await openAt("/quiz/the-original-name");
    expect(isReplayPage()).toBe(true);
    expect(document.title).toContain("A Renamed Title");
    await openAt("/quiz/a-renamed-title");
    expect(isUnavailable()).toBe(true);
  }, 30_000);

  it("a trailing slash and capital letters still find the quiz", async () => {
    await openAt("/quiz/Oct-7-Puzzle/");
    expect(isReplayPage()).toBe(true);
  }, 30_000);

  it.each([
    ["an unknown slug", "/quiz/no-such-quiz"],
    ["a slug that can't be one", "/quiz/not_a_slug!"],
    ["a draft", "/quiz/secret-draft"],
    ["a quiz scheduled later", "/quiz/future-puzzle"],
  ])("%s says it isn't available, without naming anything", async (_, address) => {
    await openAt(address);
    expect(isUnavailable()).toBe(true);
    expect(text()).not.toContain("Secret Draft");
    expect(text()).not.toContain("Future Puzzle");
    expect(document.title).toBe("What The Fudge Trivia");
  }, 30_000);

  it("/?quiz=<slug> (handed over by the server) opens the quiz at its own address", async () => {
    await openAt("/?quiz=oct-7-puzzle");
    expect(path()).toBe("/quiz/oct-7-puzzle");
    expect(isReplayPage()).toBe(true);
  }, 30_000);
});

describe("Archive cards link to their quiz", () => {
  it("each released card's title is a link to /quiz/<slug>; drafts and later quizzes have none", async () => {
    await openAt("/archive");
    expect(archiveLinks()).toEqual(expect.arrayContaining([
      ["Oct 8 Puzzle", "/quiz/oct-8-puzzle"],
      ["Oct 7 Puzzle", "/quiz/oct-7-puzzle"],
      ["Cats or Dogs?", "/quiz/cats-or-dogs-2"],
      ["Cats or Dogs?", "/quiz/cats-or-dogs"],
      ["A Renamed Title", "/quiz/the-original-name"],
    ]));
    expect(archiveLinks().map(([, href]) => href).some((h) => /secret|future/.test(h))).toBe(false);
  }, 30_000);

  it("a card plays at its quiz link; Back returns to the Archive and Forward to the quiz", async () => {
    await openAt("/");
    await nav("Archive");
    click(cardLink("Oct 7 Puzzle"));
    await flush(500);
    expect(path()).toBe("/quiz/oct-7-puzzle");
    expect(inGame()).toBe(true); // the replay starts, as the card always did

    await back();
    expect(path()).toBe("/archive");
    expect(host.querySelector(".arc-title")).not.toBeNull();

    await forward();
    expect(path()).toBe("/quiz/oct-7-puzzle");
    expect(isReplayPage()).toBe(true);

    await back();
    await back();
    expect(path()).toBe("/");
    expect(isTodayHome()).toBe(true);
  }, 30_000);

  it("a modified click (new tab) is left to the browser", async () => {
    await openAt("/archive");
    const link = cardLink("Oct 7 Puzzle");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    let claimed = null;
    const after = (e) => { claimed = e.defaultPrevented; e.preventDefault(); };
    document.addEventListener("click", after);
    act(() => { link.dispatchEvent(event); });
    document.removeEventListener("click", after);
    await flush(100);
    expect(claimed).toBe(false);
    expect(path()).toBe("/archive");
  }, 30_000);
});

describe("older links still work", () => {
  it("/puzzle/<id> opens the quiz and shows its public address in the same history entry", async () => {
    window.history.replaceState(null, "", "/stats");
    window.history.pushState(null, "", "/puzzle/t-oct7");
    const length = window.history.length;
    await openAt(null);
    expect(isReplayPage()).toBe(true);
    expect(path()).toBe("/quiz/oct-7-puzzle");
    expect(window.history.length).toBe(length);
  }, 30_000);

  it("/puzzle/<id> for a draft stays put and isn't available", async () => {
    await openAt("/puzzle/t-draft");
    expect(isUnavailable()).toBe(true);
    expect(path()).toBe("/puzzle/t-draft");
  }, 30_000);

  it("/s/<code> still shows the result; PLAY THIS QUIZ is a link to the quiz", async () => {
    const code = resultCode("t-oct7", Array.from({ length: 8 }, (_, i) => ({ questionIndex: i, correct: i % 2 === 0 })));
    await openAt(resultPath(code));
    expect(text()).toContain("Can you beat it?");
    const play = [...host.querySelectorAll("a.hm-play")].find((a) => a.textContent === "PLAY THIS QUIZ");
    expect(play.getAttribute("href")).toBe("/quiz/oct-7-puzzle");

    click(play);
    await flush(300);
    expect(path()).toBe("/quiz/oct-7-puzzle");
    expect(isReplayPage()).toBe(true);
    await back();
    expect(path()).toBe(resultPath(code));
    expect(text()).toContain("Can you beat it?");
  }, 30_000);
});
