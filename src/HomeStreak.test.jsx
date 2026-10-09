import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeHero, HomeStreak } from "./Home.jsx";

const streak = (n) => renderToStaticMarkup(<HomeStreak streak={n} flame={<i/>}/>);
const shown = (n) => streak(n).match(/<div class="hm-sk-num">([^<]*)<\/div>/)[1];
const growth = (n) => Number(streak(n).match(/--sk-t:([\d.]+)/)[1]);
const theme = (n) => streak(n).match(/data-theme="(\w+)"/)[1];

describe("HomeStreak", () => {
  it("shows nothing for no streak", () => {
    expect(streak(0)).toBe("");
    expect(streak(undefined)).toBe("");
  });

  it("always shows the real streak number, never the lap day", () => {
    for (const n of [1, 50, 99, 100, 101, 150, 200, 201, 237, 300, 301, 1234]) {
      expect(shown(n)).toBe(String(n));
    }
  });

  it("has no prestige badge through day 100", () => {
    for (const n of [1, 50, 99, 100]) {
      expect(theme(n)).toBe("classic");
      expect(streak(n)).not.toContain("hm-sk-badge");
    }
  });

  it("changes prestige theme at each 100-day boundary", () => {
    expect([100, 101, 200, 201, 300, 301, 400, 401].map(theme)).toEqual(
      ["classic", "gold", "gold", "platinum", "platinum", "fudge", "fudge", "candy"]);
    expect(streak(237)).toContain("2 prestiges");
    expect(streak(237)).toContain("237-day total streak");
  });

  it("sizes by lap day only: 1, 101, 201, 301 start small; 100, 200, 300 are huge", () => {
    for (const n of [101, 201, 301]) expect(growth(n)).toBe(growth(1));
    for (const n of [200, 300]) expect(growth(n)).toBe(growth(100));
    expect(growth(1)).toBe(0);
    expect(growth(100)).toBe(1);
    expect(growth(237)).toBe(growth(37));
    expect(growth(150)).toBe(growth(50));
  });

  it("collapses many prestiges into one compact badge", () => {
    const html = streak(2701);
    expect(html).toContain("27 prestiges");
    expect(html).toContain("\u{1F3C5} × 27");
    expect(html.split("\u{1F3C5}").length - 1).toBe(1);
  });

  it("puts DAY STREAK inside the themed unit, wearing the number's fill", () => {
    const html = streak(237);
    // One element carries data-theme; the number and the label are both inside it.
    expect(html.indexOf('data-theme="platinum"')).toBeLessThan(html.indexOf("hm-sk-num"));
    expect(html.indexOf("hm-sk-num")).toBeLessThan(html.indexOf("hm-sk-label"));
    const css = readFileSync(new URL("./homePage.css", import.meta.url), "utf8");
    const rule = (sel) => {
      const start = css.indexOf(`\n${sel} {`);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(rule(".hm-sk-label")).toContain("var(--sk-fill)");
    expect(rule(".hm-sk-num")).toContain("var(--sk-fill)");
    expect(rule(".hm-sk-label")).not.toContain("teal");
  });
});

describe("HomeHero without the visible eyebrow", () => {
  const game = { themeTitle: "T", categoryA: "A", categoryB: "B" };
  it("keeps the label for screen readers only", () => {
    const html = renderToStaticMarkup(
      <HomeHero game={game} colors={[{ mid: "#fff" }, { mid: "#000" }]} artworkUrl="/p.png" eyebrow="Today’s puzzle" hideEyebrow/>);
    expect(html).toContain('<h1 class="hm-sr-only">Today’s puzzle</h1>');
    expect(html).not.toContain("hm-eyebrow");
  });
});
