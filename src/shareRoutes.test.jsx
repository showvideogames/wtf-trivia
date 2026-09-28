import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import SharePreview from "./SharePreview.jsx";
import { shareTextFor } from "./crowdStats.js";
import { copyText, shareOrCopy } from "./homeShare.js";

// Every share route must carry the one formatter's string, character for
// character: the Results preview and copy button, Home's desktop copy, the
// native share sheet on phones, and the clipboard fallback.

const GAME = {
  categoryA: "Nicolas Cage Movies", categoryB: "Board Games",
  categoryAShareName: "Nicolas Cage Movie 🤩🎬", categoryBShareName: "Board Game 🎲♟️",
};
const answers = [..."110011001111"].map((c, i) => ({ questionIndex: i, correct: c === "1" }));
const RECORD = { puzzleId: "g-cage", date: "2026-09-27", score: 8, totalQuestions: 12, answers, completed: true };
// 100 finishers: 77 below 8, 5 at 8 (you included), 18 above.
const CROWD = { status: "ready", puzzleId: "g-cage", score: 8, stats: { finishedPlayers: 100, scoreHistogram: { 5: 77, 8: 5, 11: 18 } } };
const EXPECTED =
  "What The Fudge Trivia 🍬\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nNicolas Cage Movie 🤩🎬\n     OR\nBoard Game 🎲♟️\n" +
  "━━━━━━━━━━━━━━━━━━━━━━━━━━\n🟢🟢🔴🔴🟢🟢🔴🔴🟢🟢🟢🟢\n8/12 • Beat 77% of players\nwhatthefudge.gg";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const nav = (userAgent, share) => ({
  userAgent, maxTouchPoints: userAgent === IPHONE ? 5 : 0,
  ...(share ? { share } : {}),
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// The preview's text content, as a browser would give it.
const previewText = (text) => {
  const html = renderToStaticMarkup(<SharePreview text={text}/>);
  return html.replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
};

describe("all share routes use the formatter's exact string", () => {
  it("Results preview, Results copy, Home copy, native share and clipboard fallback", async () => {
    // Results and Home each build the text the way App.jsx does.
    const resultsText = shareTextFor(GAME, { ...RECORD }, CROWD);
    const homeText = shareTextFor(GAME, RECORD, CROWD);
    expect(resultsText).toBe(EXPECTED);
    expect(homeText).toBe(EXPECTED);

    expect(previewText(resultsText)).toBe(EXPECTED);

    const resultsCopy = nav(WINDOWS);
    expect(await copyText(resultsText, resultsCopy)).toBe("copied");

    const homeDesktop = nav(WINDOWS, vi.fn().mockResolvedValue(undefined));
    expect(await shareOrCopy(homeText, homeDesktop)).toBe("copied");

    const homePhone = nav(IPHONE, vi.fn().mockResolvedValue(undefined));
    expect(await shareOrCopy(homeText, homePhone)).toBe("shared");

    const fallback = nav(IPHONE, vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })));
    expect(await shareOrCopy(homeText, fallback)).toBe("copied");

    const sent = [
      resultsCopy.clipboard.writeText.mock.calls[0][0],
      homeDesktop.clipboard.writeText.mock.calls[0][0],
      homePhone.share.mock.calls[0][0].text,
      fallback.clipboard.writeText.mock.calls[0][0],
    ];
    for (const text of sent) expect(text).toBe(EXPECTED);
  });

  it("gives the share sheet only the text: no title or url to duplicate the header", async () => {
    const phone = nav(IPHONE, vi.fn().mockResolvedValue(undefined));
    await shareOrCopy(EXPECTED, phone);
    expect(Object.keys(phone.share.mock.calls[0][0])).toEqual(["text"]);
  });

  it("previews the text without a percentage exactly too", () => {
    const text = shareTextFor(GAME, RECORD, null);
    expect(text.split("\n")[7]).toBe("8/12");
    expect(previewText(text)).toBe(text);
  });

  it("previews long, unusual labels exactly", () => {
    const game = { categoryAShareName: "A <very> long & \"quoted\" label that's going to wrap on phones 🤩🎬", categoryBShareName: "B" };
    const text = shareTextFor(game, RECORD, CROWD);
    expect(previewText(text)).toBe(text);
  });
});

describe("no old share format left in active share code", () => {
  const files = ["share.js", "crowdStats.js", "homeShare.js", "SharePreview.jsx", "App.jsx"];
  it.each(files)("%s has no old header, arrow or domain", (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/WTF Trivia|➜|whatthefudgetrivia/);
  });
});
