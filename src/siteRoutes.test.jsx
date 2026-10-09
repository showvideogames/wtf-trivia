// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { addressForView, entryView, sectionFromPath } from "./siteRoutes.js";
import { resultCode, resultPath } from "./shareLink.js";

// The site's sections as real addresses (siteRoutes.js): /, /archive,
// /stats and /how-to-play each have a browser-history entry, so the header,
// Back, Forward, a refresh and a direct link all agree. The whole app runs
// offline (the dev backend, never a database) with two puzzles: Oct 7
// (released) and Oct 8 (today). Unlike homeMidnight.test.jsx, the address
// here is jsdom's real one, so pushState/back/forward are the browser's own.

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
        { ...base, id: "t-oct7", date: "2026-10-07", themeTitle: "Oct 7 Puzzle" },
        { ...base, id: "t-oct8", date: "2026-10-08", themeTitle: "Oct 8 Puzzle" },
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
// A refresh: the same address (and history entry), a fresh page.
const refresh = () => openAt(null);
const text = () => host.textContent;
const path = () => window.location.pathname;
const click = (el) => act(() => el.click());
const navLink = (label) => [...host.querySelectorAll(".sh-link")].find((a) => a.textContent === label);
const nav = async (label) => { click(navLink(label)); await flush(300); };
const back = async () => { act(() => window.history.back()); await flush(300); };
const forward = async () => { act(() => window.history.forward()); await flush(300); };
const current = () => host.querySelector('.sh-link[aria-current="page"]')?.textContent ?? null;

// Which screen is showing, by its own content.
const screen = () => {
  if (host.querySelector(".gp-prompt, .gp-clue-text")) return "game";
  if (host.querySelector(".arc-title")) return "archive";
  if (text().includes("Your Stats")) return "stats";
  if (text().includes("PLAY TODAY’S PUZZLE") || text().includes("Today’s puzzle")) return "home";
  return "other";
};
const helpOpen = () => document.querySelector(".htp-modal") !== null;

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
  document.querySelectorAll(".htp-bg").forEach((n) => n.remove());
  vi.useRealTimers();
});

describe("siteRoutes", () => {
  it("names each section by its address, with or without a trailing slash", () => {
    expect(sectionFromPath("/")).toBe("home");
    expect(sectionFromPath("")).toBe("home");
    expect(sectionFromPath("/archive")).toBe("archive");
    expect(sectionFromPath("/archive/")).toBe("archive");
    expect(sectionFromPath("/stats")).toBe("stats");
    expect(sectionFromPath("/how-to-play")).toBe("help");
    for (const other of ["/puzzle/g-1", "/s/abc", "/streak-lab", "/admin", "/auth/callback", "/archive/x", "/nope"]) {
      expect(sectionFromPath(other)).toBeNull();
    }
  });

  it("puts each screen at its section, and leaves links, results and replays alone", () => {
    expect(addressForView("home", "/archive")).toEqual(["/", "home"]);
    expect(addressForView("account", "/archive")).toEqual(["/", "account"]);
    expect(addressForView("archive", "/")).toEqual(["/archive", "archive"]);
    expect(addressForView("stats", "/")).toEqual(["/stats", "stats"]);
    // The daily game belongs to Home, except when a puzzle link started it.
    expect(addressForView("game", "/archive")).toEqual(["/", "home"]);
    expect(addressForView("score", "/")).toEqual(["/", "home"]);
    expect(addressForView("game", "/puzzle/g-1")).toBeNull();
    for (const view of ["replay", "replay-score", "puzzle", "result", "admin"]) {
      expect(addressForView(view, "/archive")).toBeNull();
    }
    expect(entryView("/", { wtfView: "account" })).toBe("account");
    expect(entryView("/stats", null)).toBe("stats");
  });
});

describe("each section opens at its own address", () => {
  it.each([
    ["/", "home", "Play"],
    ["/archive", "archive", "Archive"],
    ["/stats", "stats", "Stats"],
  ])("%s renders %s, with %s marked current", async (address, expected, link) => {
    await openAt(address);
    expect(screen()).toBe(expected);
    expect(current()).toBe(link);
    expect(path()).toBe(address);
    expect(helpOpen()).toBe(false);
    // A refresh stays put.
    await refresh();
    expect(screen()).toBe(expected);
    expect(path()).toBe(address);
  }, 30_000);

  it("/how-to-play opens How to Play over Home; a refresh keeps it; Got it leaves Home at /", async () => {
    await openAt("/how-to-play");
    expect(helpOpen()).toBe(true);
    expect(screen()).toBe("home");
    expect(host.querySelector(".sh-link.is-current")?.textContent).toBe("How to Play");
    await refresh();
    expect(helpOpen()).toBe(true);
    const length = window.history.length;
    click(document.querySelector(".htp-play"));
    await flush(300);
    expect(helpOpen()).toBe(false);
    expect(screen()).toBe("home");
    expect(path()).toBe("/");
    expect(window.history.length).toBe(length); // replaced, not added
  }, 30_000);

  it("a trailing slash opens the section and is tidied away", async () => {
    await openAt("/archive/");
    expect(screen()).toBe("archive");
    expect(path()).toBe("/archive");
  }, 30_000);
});

describe("header navigation uses real links and real history", () => {
  it("the page links are links to their addresses", async () => {
    await openAt("/");
    const hrefs = [...host.querySelectorAll(".sh-nav a.sh-link")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(hrefs).toEqual([["Play", "/"], ["Archive", "/archive"], ["Stats", "/stats"], ["How to Play", "/how-to-play"]]);
  }, 30_000);

  it("Home → Archive → Back → Home, then Forward → Archive", async () => {
    await openAt("/");
    const start = window.history.length;
    await nav("Archive");
    expect(path()).toBe("/archive");
    expect(screen()).toBe("archive");
    expect(current()).toBe("Archive");
    expect(window.history.length).toBe(start + 1);

    await back();
    expect(path()).toBe("/");
    expect(screen()).toBe("home");
    expect(current()).toBe("Play");

    await forward();
    expect(path()).toBe("/archive");
    expect(screen()).toBe("archive");
    expect(current()).toBe("Archive");
  }, 30_000);

  it("Home → Archive → Stats → Back → Archive → Back → Home, and Forward twice", async () => {
    await openAt("/");
    await nav("Archive");
    await nav("Stats");
    expect(path()).toBe("/stats");
    expect(screen()).toBe("stats");

    await back();
    expect([path(), screen()]).toEqual(["/archive", "archive"]);
    await back();
    expect([path(), screen()]).toEqual(["/", "home"]);
    await forward();
    expect([path(), screen()]).toEqual(["/archive", "archive"]);
    await forward();
    expect([path(), screen()]).toEqual(["/stats", "stats"]);
    expect(current()).toBe("Stats");
  }, 30_000);

  it("pressing the current link again adds no entry", async () => {
    await openAt("/archive");
    const start = window.history.length;
    await nav("Archive");
    expect(window.history.length).toBe(start);
    expect(path()).toBe("/archive");
  }, 30_000);

  it("a modified click (new tab) is left to the browser", async () => {
    await openAt("/");
    const link = navLink("Stats");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    // Note whether the app claimed the click, then stop jsdom (which can't
    // open tabs) from following it.
    let claimed = null;
    const after = (e) => { claimed = e.defaultPrevented; e.preventDefault(); };
    document.addEventListener("click", after);
    act(() => { link.dispatchEvent(event); });
    document.removeEventListener("click", after);
    await flush(100);
    expect(claimed).toBe(false);
    expect(screen()).toBe("home");
  }, 30_000);

  it("a screen's own buttons (Stats' ← Back) move the address too", async () => {
    await openAt("/archive");
    await nav("Stats");
    click([...host.querySelectorAll("button")].find((b) => b.textContent === "← Back"));
    await flush(300);
    expect([path(), screen()]).toEqual(["/", "home"]);
    await back();
    expect([path(), screen()]).toEqual(["/stats", "stats"]);
  }, 30_000);
});

describe("How to Play has its own history entry", () => {
  it("opens at /how-to-play over the page; Back closes it and leaves the page as it was", async () => {
    await openAt("/archive");
    await nav("How to Play");
    expect(helpOpen()).toBe(true);
    expect(path()).toBe("/how-to-play");
    expect(screen()).toBe("archive");

    await back();
    expect(helpOpen()).toBe(false);
    expect([path(), screen()]).toEqual(["/archive", "archive"]);

    await forward();
    expect(helpOpen()).toBe(true);
    expect(screen()).toBe("archive");
  }, 30_000);

  it("Got it steps back over its entry, so Back afterwards goes to the page before", async () => {
    await openAt("/");
    await nav("Archive");
    await nav("How to Play");
    click(document.querySelector(".htp-play"));
    await flush(300);
    expect(helpOpen()).toBe(false);
    expect([path(), screen()]).toEqual(["/archive", "archive"]);
    await back();
    expect([path(), screen()]).toEqual(["/", "home"]);
    expect(helpOpen()).toBe(false);
  }, 30_000);
});

describe("game and session state survive navigation", () => {
  const play = () => [...host.querySelectorAll("button")].find((b) => b.textContent.includes("PLAY TODAY’S PUZZLE"));

  it("How to Play over a game in progress closes back to the same game", async () => {
    await openAt("/");
    click(play());
    await flush(500);
    expect(screen()).toBe("game");
    const question = host.querySelector(".gp-prompt, .gp-clue-text").textContent;
    await nav("How to Play");
    expect(path()).toBe("/how-to-play");
    await back();
    expect(helpOpen()).toBe(false);
    expect(screen()).toBe("game");
    expect(host.querySelector(".gp-prompt, .gp-clue-text").textContent).toBe(question);
    expect(path()).toBe("/");
  }, 30_000);

  it("today's game started from the Archive moves to /, and Back returns to the Archive with the game saved", async () => {
    await openAt("/archive");
    const today = [...host.querySelectorAll(".arc-card")].find((c) => c.querySelector(".arc-tag")?.textContent === "Today");
    click(today.querySelector(".arc-action"));
    await flush(500);
    expect(screen()).toBe("game");
    expect(path()).toBe("/");
    click(host.querySelector(".ans-box"));
    await flush(400);
    click(host.querySelector(".gp-next"));
    await flush(200);

    await back();
    expect([path(), screen()]).toEqual(["/archive", "archive"]);
    const saved = JSON.parse(localStorage.getItem(RECORD_KEY))["t-oct8"];
    expect(saved.answers.length).toBe(1);
    expect(saved.completed).toBe(false);

    // Home (by the header) offers to carry on where it was.
    await nav("Play");
    expect(path()).toBe("/");
    expect(text()).not.toContain("PLAY TODAY’S PUZZLE");
  }, 30_000);
});

describe("existing addresses still work", () => {
  it("/puzzle/<id> opens that puzzle's page; the header leaves it and Back returns to it", async () => {
    await openAt("/puzzle/t-oct7");
    expect(text()).toContain("Archive puzzle");
    expect(current()).toBeNull();
    await nav("Archive");
    expect([path(), screen()]).toEqual(["/archive", "archive"]);
    await back();
    expect(path()).toBe("/puzzle/t-oct7");
    expect(text()).toContain("Archive puzzle");
  }, 30_000);

  it("/puzzle/<today> is Home itself, and stays at its link", async () => {
    await openAt("/puzzle/t-oct8");
    expect(screen()).toBe("home");
    expect(path()).toBe("/puzzle/t-oct8");
  }, 30_000);

  it("/s/<code> opens the shared result; Back from the site returns to it", async () => {
    const code = resultCode("t-oct7", Array.from({ length: 8 }, (_, i) => ({ questionIndex: i, correct: i % 2 === 0 })));
    await openAt(resultPath(code));
    expect(text()).toContain("Can you beat it?");
    await nav("Stats");
    expect([path(), screen()]).toEqual(["/stats", "stats"]);
    await back();
    expect(path()).toBe(resultPath(code));
    expect(text()).toContain("Can you beat it?");
  }, 30_000);

  it("/streak-lab still opens the Streak Lab, not the game", async () => {
    window.history.replaceState(null, "", "/streak-lab");
    const el = document.createElement("div");
    el.id = "root";
    document.body.appendChild(el);
    vi.resetModules();
    await act(async () => { await import("./main.jsx"); });
    await flush(100);
    expect(el.textContent).toContain("STREAK LAB — QA ONLY");
    expect(el.querySelector(".arc-title")).toBeNull();
    el.remove();
  }, 30_000);
});

describe("Vercel serves the app at every section's address", () => {
  const { rewrites } = JSON.parse(readFileSync("vercel.json", "utf8"));
  const destination = (source) => rewrites.find((r) => r.source === source)?.destination;

  it.each(["/archive", "/stats", "/how-to-play"])("%s (and %s/) → index.html", (address) => {
    expect(destination(address)).toBe("/index.html");
    expect(destination(`${address}/`)).toBe("/index.html");
  });

  it("keeps the existing routes as they were", () => {
    expect(destination("/streak-lab")).toBe("/index.html");
    expect(destination("/admin")).toBe("/index.html");
    expect(destination("/auth/callback")).toBe("/index.html");
    expect(destination("/s/:code")).toBe("/api/share?code=:code");
    expect(destination("/puzzle/:id")).toBe("/api/puzzle?id=:id");
  });
});
