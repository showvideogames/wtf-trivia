// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HomeHero, HomeUpNext, SHORT_HERO_FIT } from "./Home.jsx";
import { countdownTier } from "./schedule.js";

// Home's Up Next block (countdown + artwork with its fallbacks) and the
// hero's square/wide choice, rendered in a DOM.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const GAME = { themeTitle: "Cereal Mascot or Wrestler?", categoryA: "Cereal Mascot", categoryB: "Wrestler", categoryAImage: "/a.png", categoryBImage: "/b.png" };
const COLORS = [{ mid: "#FFD23F" }, { mid: "#B98CFF" }];
const WIDE = "https://x.test/wide.webp";
const SQUARE = "https://x.test/square.webp";

let root = null;
let host = null;
const mount = (ui) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(ui));
  return host;
};
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.useRealTimers();
});

describe("Up Next", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 9, 6, 21, 59, 57) }));

  it("counts down to the opening each second, then shows PLAY NOW in its place", () => {
    const opensAt = new Date(2026, 9, 7, 0, 0, 0).getTime();
    const el = mount(<HomeUpNext game={GAME} colors={COLORS} wideUrl={WIDE} squareUrl={SQUARE} opensAt={opensAt}/>);
    const digits = () => [...el.querySelectorAll(".hm-cd-num")].map((n) => n.textContent).join(" ");
    expect(el.querySelector("h2").textContent).toBe("Up next");
    expect(digits()).toBe("02 00 03");
    expect([...el.querySelectorAll(".hm-cd-unit")].map((n) => n.textContent)).toEqual(["hrs", "min", "sec"]);
    expect(el.querySelector('[role="timer"]').getAttribute("aria-label")).toBe("Opens in 2 hours");
    act(() => vi.advanceTimersByTime(1000));
    expect(digits()).toBe("02 00 02");
    act(() => vi.advanceTimersByTime(2 * 3600 * 1000));
    expect(digits()).toBe("00 00 02");
    expect(el.querySelector(".hm-next-play")).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(el.querySelector('[role="timer"]')).toBeNull();
    expect(el.querySelector(".hm-next-play").textContent).toBe("Play now");
    // The artwork stays; nothing else changes until the player presses it.
    expect(el.querySelector(".hm-next-art img").getAttribute("src")).toBe(WIDE);
    act(() => vi.advanceTimersByTime(60000));
    expect(el.querySelector(".hm-next-play")).not.toBeNull();
  });

  it("PLAY NOW only reloads the page", () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    try {
      const el = mount(<HomeUpNext game={GAME} colors={COLORS} wideUrl={WIDE} opensAt={Date.now() - 1000}/>);
      act(() => el.querySelector(".hm-next-play").click());
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("warms up as the opening nears: calm, then aqua inside an hour, then pink with sparks inside ten minutes", () => {
    expect(countdownTier(3 * 3600e3)).toBe("calm");
    expect(countdownTier(3600e3)).toBe("calm");
    expect(countdownTier(3600e3 - 1)).toBe("close");
    expect(countdownTier(45 * 60e3)).toBe("close");
    expect(countdownTier(10 * 60e3)).toBe("close");
    expect(countdownTier(10 * 60e3 - 1)).toBe("soon");
    expect(countdownTier(8 * 60e3)).toBe("soon");
    expect(countdownTier(1)).toBe("soon");
    expect(countdownTier(0)).toBe("open");
    const tierAt = (ms) => {
      const el = mount(<HomeUpNext game={GAME} colors={COLORS} wideUrl={WIDE} opensAt={Date.now() + ms}/>);
      const out = [el.querySelector(".hm-cd").dataset.tier, el.querySelectorAll(".hm-cd-sparks").length];
      act(() => root.unmount()); host.remove(); root = host = null;
      return out;
    };
    expect(tierAt(2 * 3600e3)).toEqual(["calm", 0]);
    expect(tierAt(45 * 60e3)).toEqual(["close", 0]);
    expect(tierAt(8 * 60e3)).toEqual(["soon", 2]);
  });

  it("shows the wide artwork whole, with nothing else but the label and countdown", () => {
    const el = mount(<HomeUpNext game={GAME} colors={COLORS} wideUrl={WIDE} squareUrl={SQUARE} opensAt={Date.now() + 3600e3}/>);
    const img = el.querySelector(".hm-next-art img");
    expect(img.getAttribute("src")).toBe(WIDE);
    expect(img.getAttribute("alt")).toBe(GAME.themeTitle);
    expect(el.querySelectorAll("p").length).toBe(0); // no description paragraph
    expect(el.querySelector(".hm-next-art").className).toBe("hm-next-art");
  });

  it("falls back to the square poster, then the category matchup, when artwork is missing or broken", () => {
    let el = mount(<HomeUpNext game={GAME} colors={COLORS} wideUrl={null} squareUrl={SQUARE} opensAt={Date.now() + 3600e3}/>);
    expect(el.querySelector(".hm-next-art.is-square img").getAttribute("src")).toBe(SQUARE);
    act(() => root.unmount()); host.remove();

    el = mount(<HomeUpNext game={GAME} colors={COLORS} wideUrl={WIDE} squareUrl={SQUARE} opensAt={Date.now() + 3600e3}/>);
    act(() => el.querySelector(".hm-next-art img").dispatchEvent(new Event("error")));
    expect(el.querySelector(".hm-next-art img").getAttribute("src")).toBe(SQUARE);
    act(() => el.querySelector(".hm-next-art img").dispatchEvent(new Event("error")));
    expect(el.querySelector(".hm-next-art .hm-matchup").getAttribute("aria-label")).toBe("Cereal Mascot or Wrestler");
  });

  it("shows days when the next puzzle is more than a day away", () => {
    const el = mount(<HomeUpNext game={GAME} colors={COLORS} wideUrl={WIDE} opensAt={Date.now() + (2 * 24 + 3) * 3600e3}/>);
    expect([...el.querySelectorAll(".hm-cd-unit")].map((n) => n.textContent)).toEqual(["days", "hrs", "min", "sec"]);
    expect(el.querySelector(".hm-cd-num").textContent).toBe("2");
  });
});

describe("Home hero: square by default, wide on short screens", () => {
  // jsdom has no layout: stand in for the probe's svh height, the column
  // width and the desktop media query.
  let probeHeight = 600;
  let desktop = false;
  beforeEach(() => {
    globalThis.ResizeObserver = class { observe() {} disconnect() {} };
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function () {
      return this.classList.contains("hm-art-probe") ? probeHeight : 0;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => 358);
    window.matchMedia = () => ({ matches: desktop });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.ResizeObserver;
    probeHeight = 600;
    desktop = false;
  });
  const hero = (props) => mount(<HomeHero game={GAME} colors={COLORS} eyebrow="Today’s puzzle" {...props}/>);
  const shown = (el) => el.querySelector(".hm-artwork img")?.getAttribute("src");

  it("keeps the square where it fits, and switches to the wide artwork where it doesn't", () => {
    probeHeight = Math.ceil(358 * SHORT_HERO_FIT);
    expect(shown(hero({ artworkUrl: SQUARE, wideUrl: WIDE }))).toBe(SQUARE);
    act(() => root.unmount()); host.remove();
    probeHeight = Math.floor(358 * SHORT_HERO_FIT) - 1;
    const el = hero({ artworkUrl: SQUARE, wideUrl: WIDE });
    expect(shown(el)).toBe(WIDE);
    expect(el.querySelector(".hm-artwork").className).toBe("hm-artwork is-wide");
  });

  it("keeps the square on desktops, and when there is no wide artwork, however short", () => {
    probeHeight = 50;
    desktop = true;
    expect(shown(hero({ artworkUrl: SQUARE, wideUrl: WIDE }))).toBe(SQUARE);
    act(() => root.unmount()); host.remove();
    desktop = false;
    const el = hero({ artworkUrl: SQUARE, wideUrl: null });
    expect(shown(el)).toBe(SQUARE);
    expect(el.querySelector(".hm-art-probe")).toBeNull();
  });

  it("goes back to the square if the wide artwork fails to load, and shows wide-only artwork anywhere", () => {
    probeHeight = 50;
    const el = hero({ artworkUrl: SQUARE, wideUrl: WIDE });
    act(() => el.querySelector(".hm-artwork img").dispatchEvent(new Event("error")));
    expect(shown(el)).toBe(SQUARE);
    act(() => root.unmount()); host.remove();
    probeHeight = 900;
    expect(shown(hero({ artworkUrl: null, wideUrl: WIDE }))).toBe(WIDE);
  });
});
