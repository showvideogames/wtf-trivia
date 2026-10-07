import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BRAND_IMAGE, absoluteImageUrl, earliestOpenDay, metaTags, previewImage, previewReleased, puzzleMeta, withPuzzleMeta,
} from "./puzzleMeta.js";

const GAME = {
  id: "g-cage",
  date: "2026-10-05",
  status: "published",
  themeTitle: "Board Game or Nicolas Cage Movie?",
  categoryA: "Board Games",
  categoryB: "Nicolas Cage Movies",
  categoryAShareName: "Board Game 🎲",
  categoryBShareName: "Nicolas Cage Movie 🎬",
  headerImage: "https://cdn.test/square.webp",
  wideImage: "https://cdn.test/wide.webp",
};
const SHELL = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("previewReleased", () => {
  const at = (iso) => new Date(iso);

  it("opens a puzzle's preview once its date has begun anywhere (UTC+14)", () => {
    expect(earliestOpenDay(at("2026-10-07T09:59:59Z"))).toBe("2026-10-07");
    expect(earliestOpenDay(at("2026-10-07T10:00:00Z"))).toBe("2026-10-08");
    const tomorrow = { ...GAME, date: "2026-10-08" };
    expect(previewReleased(tomorrow, at("2026-10-07T09:59:59Z"))).toBe(false);
    expect(previewReleased(tomorrow, at("2026-10-07T10:00:00Z"))).toBe(true);
  });

  it("keeps older and today's published puzzles open", () => {
    expect(previewReleased(GAME, at("2026-10-07T12:00:00Z"))).toBe(true);
    expect(previewReleased({ ...GAME, date: "2026-10-07" }, at("2026-10-07T00:00:00Z"))).toBe(true);
  });

  it("never opens drafts, retired puzzles, later puzzles or bad dates", () => {
    const now = at("2026-10-07T12:00:00Z");
    expect(previewReleased({ ...GAME, status: "draft" }, now)).toBe(false);
    expect(previewReleased({ ...GAME, status: "retired" }, now)).toBe(false);
    expect(previewReleased({ ...GAME, date: "2026-10-10" }, now)).toBe(false);
    expect(previewReleased({ ...GAME, date: "" }, now)).toBe(false);
    expect(previewReleased({ ...GAME, date: "soon" }, now)).toBe(false);
    expect(previewReleased(null, now)).toBe(false);
  });
});

describe("previewImage", () => {
  it("prefers the wide artwork, then the square poster, then the site's image", () => {
    expect(previewImage(GAME)).toMatchObject({ url: "https://cdn.test/wide.webp", wide: true });
    expect(previewImage({ ...GAME, wideImage: "" })).toMatchObject({ url: "https://cdn.test/square.webp", wide: false });
    expect(previewImage({ ...GAME, wideImage: null, headerImage: null })).toMatchObject({ url: BRAND_IMAGE.url, width: 512, height: 512, wide: false });
  });

  it("only uses addresses a crawler can fetch, made absolute", () => {
    expect(absoluteImageUrl("/uploads/wide.png")).toBe("https://whatthefudge.gg/uploads/wide.png");
    expect(absoluteImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(absoluteImageUrl("blob:https://x/1")).toBeNull();
    expect(absoluteImageUrl("javascript:alert(1)")).toBeNull();
    expect(absoluteImageUrl("  ")).toBeNull();
    expect(previewImage({ ...GAME, wideImage: "data:image/png;base64,AAAA" })).toMatchObject({ url: "https://cdn.test/square.webp" });
  });
});

describe("puzzleMeta", () => {
  it("names the puzzle, both categories (share names first) and its link", () => {
    const meta = puzzleMeta(GAME);
    expect(meta.title).toBe("Board Game or Nicolas Cage Movie?");
    expect(meta.pageTitle).toBe("Board Game or Nicolas Cage Movie? · What The Fudge Trivia");
    expect(meta.description).toBe("Board Game 🎲 or Nicolas Cage Movie 🎬? Every clue belongs to one of them. Play the puzzle and compare scores.");
    expect(meta.url).toBe("https://whatthefudge.gg/puzzle/g-cage");
  });

  it("never carries a question or an answer", () => {
    const game = { ...GAME, questions: [{ itemText: "SECRET CLUE", correctCategory: "A", explanationCopy: "SECRET ANSWER" }] };
    const html = withPuzzleMeta(SHELL, puzzleMeta(game));
    expect(html).not.toContain("SECRET");
  });
});

describe("withPuzzleMeta", () => {
  const html = withPuzzleMeta(SHELL, puzzleMeta(GAME));
  const count = (pattern) => (html.match(pattern) || []).length;

  it("replaces the site's title, description, canonical link and og/twitter tags with the puzzle's", () => {
    expect(count(/<title>/g)).toBe(1);
    expect(html).toContain("<title>Board Game or Nicolas Cage Movie? · What The Fudge Trivia</title>");
    expect(count(/<meta name="description"/g)).toBe(1);
    expect(count(/<link rel="canonical"/g)).toBe(1);
    expect(html).toContain('<link rel="canonical" href="https://whatthefudge.gg/puzzle/g-cage" />');
    expect(count(/property="og:title"/g)).toBe(1);
    expect(count(/property="og:image"/g)).toBe(1);
    expect(html).toContain('<meta property="og:image" content="https://cdn.test/wide.webp" />');
    expect(html).toContain('<meta property="og:url" content="https://whatthefudge.gg/puzzle/g-cage" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).not.toContain("icon-512.png");
    expect(html).not.toContain('content="512"');
  });

  it("leaves the rest of the page alone", () => {
    for (const keep of ['<div id="root"></div>', 'src="/src/main.jsx"', 'rel="manifest"', 'name="viewport"', 'name="theme-color"']) {
      expect(html).toContain(keep);
    }
  });

  it("escapes titles and names", () => {
    const tricky = { ...GAME, themeTitle: 'Cats & "Dogs" <b>$1</b>', categoryAShareName: "A's", wideImage: "https://cdn.test/w.png?a=1&b=2" };
    const out = withPuzzleMeta(SHELL, puzzleMeta(tricky));
    expect(out).toContain("<title>Cats &amp; &quot;Dogs&quot; &lt;b&gt;$1&lt;/b&gt; · What The Fudge Trivia</title>");
    expect(out).toContain("A&#39;s or Nicolas Cage Movie 🎬?");
    expect(out).toContain('content="https://cdn.test/w.png?a=1&amp;b=2"');
    expect(out).not.toContain("<b>");
  });

  it("asks for a small card for the square poster and gives the brand image its size", () => {
    expect(metaTags(puzzleMeta({ ...GAME, wideImage: null }))).toContain('<meta name="twitter:card" content="summary" />');
    const brand = metaTags(puzzleMeta({ ...GAME, wideImage: null, headerImage: null }));
    expect(brand).toContain('<meta property="og:image" content="https://whatthefudge.gg/icon-512.png" />');
    expect(brand).toContain('<meta property="og:image:width" content="512" />');
  });
});
