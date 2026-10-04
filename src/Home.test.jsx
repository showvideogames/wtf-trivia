import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeHero } from "./Home.jsx";
import { puzzleArtworkUrl } from "./homeShare.js";

// Home's heading and centrepiece: the puzzle's Home & Share poster under the
// small eyebrow when it has one, otherwise the visible title and the
// category matchup.

const TITLE = "Led Zeppelin OR My Little Pony Song?";
const GAME = { themeTitle: TITLE, categoryA: "Led Zeppelin", categoryB: "My Little Pony", categoryAImage: "/a.png", categoryBImage: "/b.png" };
const COLORS = [{ mid: "#FF9A3C" }, { mid: "#B98CFF" }];
const POSTER = "https://example.supabase.co/storage/v1/object/public/wtf-images/headers/poster.webp";
const hero = (game) => renderToStaticMarkup(
  <HomeHero game={game} colors={COLORS} artworkUrl={puzzleArtworkUrl(game)} eyebrow="Today’s puzzle"/>
);
const count = (html, text) => html.split(text).length - 1;

describe("Home hero", () => {
  it("shows the square poster, whole, when the puzzle has Home & Share artwork", () => {
    const html = hero({ ...GAME, headerImage: POSTER });
    expect(html).toContain(`<div class="hm-artwork"><img src="${POSTER}" alt="${TITLE}"`);
    expect(html).not.toContain("hm-matchup");
    expect(html).not.toContain("hm-or"); // nothing drawn over the poster
  });

  it("drops the visible title above a poster: the eyebrow is the h1, the title is said once, as the alt", () => {
    const html = hero({ ...GAME, headerImage: POSTER });
    expect(html).toContain('<h1 class="hm-eyebrow">Today’s puzzle</h1>');
    expect(count(html, "<h1")).toBe(1);
    expect(html).not.toContain("hm-title");
    expect(count(html, TITLE)).toBe(1);
    expect(count(html, "Led Zeppelin")).toBe(1);
    // Without a title, the alt names the two categories.
    expect(hero({ ...GAME, themeTitle: "", headerImage: POSTER })).toContain('alt="Led Zeppelin or My Little Pony"');
  });

  it("falls back to the visible title and the category matchup without artwork", () => {
    for (const headerImage of [undefined, "", "   ", "null", "javascript:alert(1)"]) {
      const html = hero({ ...GAME, headerImage });
      expect(html).toContain(`<h1 class="hm-title">${TITLE}</h1>`);
      expect(html).toContain('<p class="hm-eyebrow">Today’s puzzle</p>');
      expect(html).toContain('class="hm-matchup"');
      expect(html).toContain('aria-label="Led Zeppelin or My Little Pony"');
      expect(html).not.toContain("hm-artwork");
    }
  });
});
