import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PaperPrompt from "./PaperPrompt.jsx";
import { PAPERS, paperLayout } from "./paperAssets.js";
import { LOOK_KEY, PAPER_KEY, readPaperAsset, readPaperLook } from "./gameplayLook.js";

describe("PaperPrompt", () => {
  it("renders the question as live heading text; the paper is only a decorative image", () => {
    const html = renderToStaticMarkup(<PaperPrompt as="h1" className="gp-prompt lg">Montgomery Biscuits</PaperPrompt>);
    expect(html).toContain('<h1 class="pp-text">Montgomery Biscuits</h1>');
    expect(html).toContain('class="pp gp-prompt lg"');
  });
});

describe("paper layout", () => {
  const ONE_LINE = 39.6, TWO_LINES = 79.2, FOUR_LINES = 99.5;

  it("deepens the parchment with the title: short, medium, then the standard sheet", () => {
    expect(paperLayout({ width: 358, textHeight: ONE_LINE, lines: 1 }).id).toBe("short");
    expect(paperLayout({ width: 358, textHeight: TWO_LINES, lines: 2 }).id).toBe("medium");
    expect(paperLayout({ width: 358, textHeight: 3 * 34.96, lines: 3 }).id).toBe("parchment");
    expect(paperLayout({ width: 331, textHeight: FOUR_LINES, lines: 4 }).id).toBe("parchment");
  });

  it("gives the prompt the sheet's own proportions, so nothing is stretched or cropped", () => {
    // Widths and text heights as rendered at 360, 390 and 430px.
    for (const [width, textHeight, lines] of [[358, ONE_LINE, 1], [358, TWO_LINES, 2], [331, 73.1, 2], [396, 87.3, 2], [331, FOUR_LINES, 4]]) {
      const l = paperLayout({ width, textHeight, lines });
      expect(l.cropped).toBe(false);
      expect(Math.abs(l.height - width / PAPERS[l.id].aspect)).toBeLessThan(1);
    }
  });

  it("grows and crops the sides, never distorts, when the text is too tall for the sheet", () => {
    expect(paperLayout({ width: 358, textHeight: ONE_LINE, lines: 1, force: "parchment" }).id).toBe("parchment");
    const forced = paperLayout({ width: 358, textHeight: TWO_LINES, lines: 2, force: "short" });
    expect(forced.id).toBe("short");
    expect(forced.cropped).toBe(true);
    expect(forced.height).toBeGreaterThan(358 / PAPERS.short.aspect);
  });
});

describe("gameplay look flags", () => {
  const store = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  };

  it("is the paper look by default", () => {
    expect(readPaperLook("", store())).toBe(true);
    expect(readPaperLook("?look=whatever", store())).toBe(true);
  });

  it("falls back to the classic look with ?look=classic, until ?look=paper", () => {
    const s = store();
    expect(readPaperLook("?look=classic", s)).toBe(false);
    expect(s.getItem(LOOK_KEY)).toBe("classic");
    expect(readPaperLook("", s)).toBe(false);
    expect(readPaperLook("?look=paper", s)).toBe(true);
    expect(readPaperLook("", s)).toBe(true);
  });

  it("still honours ?look=classic when storage is blocked", () => {
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
    expect(readPaperLook("?look=classic", blocked)).toBe(false);
    expect(readPaperLook("", blocked)).toBe(true);
  });

  it("forces one paper sheet for review with ?paper=, until ?paper=auto", () => {
    const s = store();
    expect(readPaperAsset("", s)).toBe(null);
    expect(readPaperAsset("?paper=medium", s)).toBe("medium");
    expect(s.getItem(PAPER_KEY)).toBe("medium");
    expect(readPaperAsset("", s)).toBe("medium");
    expect(readPaperAsset("?paper=cream", s)).toBe("medium");
    expect(readPaperAsset("?paper=short", s)).toBe("short");
    expect(readPaperAsset("?paper=auto", s)).toBe(null);
  });
});
