import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeHero } from "./Home.jsx";
import { puzzleArtworkUrl } from "./homeShare.js";

// Home's centrepiece: the puzzle's Home & Share poster when it has one,
// otherwise the category matchup.

const GAME = { categoryA: "Led Zeppelin", categoryB: "My Little Pony", categoryAImage: "/a.png", categoryBImage: "/b.png" };
const COLORS = [{ mid: "#FF9A3C" }, { mid: "#B98CFF" }];
const POSTER = "https://example.supabase.co/storage/v1/object/public/wtf-images/headers/poster.webp";
const hero = (game) => renderToStaticMarkup(<HomeHero game={game} colors={COLORS} artworkUrl={puzzleArtworkUrl(game)}/>);

describe("Home hero", () => {
  it("shows the square poster, whole, when the puzzle has Home & Share artwork", () => {
    const html = hero({ ...GAME, headerImage: POSTER });
    expect(html).toMatch(/<div class="hm-artwork"><img src="[^"]+poster\.webp" alt="Led Zeppelin or My Little Pony"/);
    expect(html).not.toContain("hm-matchup");
    expect(html).not.toContain("hm-or"); // nothing drawn over the poster
  });

  it("falls back to the category matchup without artwork", () => {
    for (const headerImage of [undefined, "", "   ", "null", "javascript:alert(1)"]) {
      const html = hero({ ...GAME, headerImage });
      expect(html).toContain('class="hm-matchup"');
      expect(html).toContain('aria-label="Led Zeppelin or My Little Pony"');
      expect(html).not.toContain("hm-artwork");
    }
  });
});
