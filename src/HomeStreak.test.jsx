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

  it("puts DAY STREAK inside the themed unit, flat, in the theme's colour", () => {
    const html = streak(237);
    // One element carries data-theme; the number and the label are both inside it.
    expect(html.indexOf('data-theme="platinum"')).toBeLessThan(html.indexOf("hm-sk-num"));
    expect(html.indexOf("hm-sk-num")).toBeLessThan(html.indexOf("hm-sk-label"));
    const css = readFileSync(new URL("./homePage.css", import.meta.url), "utf8");
    const rule = (sel) => {
      const start = css.indexOf(`
${sel} {`);
      return css.slice(start, css.indexOf("}", start));
    };
    // The number is dimensional; the label is flat: its colour only.
    expect(rule(".hm-sk-num")).toContain("var(--sk-fill)");
    expect(rule(".hm-sk-num")).toContain("drop-shadow");
    const label = rule(".hm-sk-label");
    expect(label).toContain("color: var(--sk-label)");
    for (const bad of ["teal", "text-stroke", "drop-shadow", "text-shadow", "filter", "var(--sk-fill)"]) expect(label).not.toContain(bad);
    // Every theme sets that colour (classic on the base rule, candy as a rainbow).
    for (const t of ["gold", "platinum", "fudge"]) {
      const at = css.indexOf(`.hm-sk[data-theme="${t}"] {`);
      expect(css.slice(at, css.indexOf("}", at))).toContain("--sk-label:");
    }
    expect(rule(".hm-sk")).toContain("--sk-label:");
    expect(css).toContain('.hm-sk[data-theme="candy"] .hm-sk-label');
  });
});

describe("HomeStreak centring", () => {
  const css = readFileSync(new URL("./homePage.css", import.meta.url), "utf8");
  const rule = (sel) => {
    const start = css.indexOf(`
${sel} {`);
    return css.slice(start, css.indexOf("}", start));
  };

  it("hangs the guest nudge off the whole stack on its own, so it never takes part in centring", () => {
    const hint = rule(".hm-sk-hint");
    expect(hint).toContain("position: absolute");
    expect(hint).toContain("left: calc(100% + 10px)");
    // Vertically centred against the whole stack.
    expect(hint).toContain("top: 50%");
    expect(hint).toContain("translateY(-50%)");
    expect(rule(".hm-sk")).toContain("position: relative");
    // Top-right corner of the content area when there is no room to the right.
    const corner = rule(".hm-sk.is-corner .hm-sk-hint");
    expect(corner).toContain("top: 0");
    expect(corner).toContain("right:");
  });

  it("centres the squashed number: a centred box, scaled about its own centre", () => {
    expect(rule(".hm-sk-numbox")).toContain("justify-content: center");
    expect(rule(".hm-sk-num")).toContain("transform-origin: center center");
    expect(rule(".hm-sk-num")).toContain("flex: none");
  });
});

describe("HomeStreak guest sign-in nudge", () => {
  const withHint = (n) => renderToStaticMarkup(<HomeStreak streak={n} flame={<i/>} onSignIn={() => {}}/>);

  it("shows the nudge copy for a guest, as a button, after the stack", () => {
    const html = withHint(50);
    expect(html).toContain('<button type="button" class="hm-signin-hint hm-sk-hint">Don’t lose your streak — sign in</button>');
    expect(html).not.toContain("Sign in to save your streak");
    expect(html.indexOf("hm-sk-num")).toBeLessThan(html.indexOf("hm-sk-label"));
    expect(html.indexOf("hm-sk-label")).toBeLessThan(html.indexOf("hm-sk-hint"));
  });

  it("is not shown when signed in, or without a streak", () => {
    expect(streak(50)).not.toContain("Sign in");
    expect(streak(50)).toContain('class="hm-sk"');
    expect(withHint(0)).toBe("");
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
