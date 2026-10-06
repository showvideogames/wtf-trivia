import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import SharePreview from "./SharePreview.jsx";
import { shareTextFor, shareTextsFor } from "./crowdStats.js";
import { copyText, shareOrCopy, shareResult } from "./homeShare.js";

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

describe("the short text sent with the poster", () => {
  // 8 questions, 5 right; 100 finishers: 67 below 5, 6 at 5 (you included), 27 above.
  const record8 = { puzzleId: "g-zep", date: "2026-10-04", score: 5, totalQuestions: 8, completed: true,
    answers: [..."11010110"].map((c, i) => ({ questionIndex: i, correct: c === "1" })) };
  const crowd8 = { status: "ready", puzzleId: "g-zep", score: 5, stats: { finishedPlayers: 100, scoreHistogram: { 3: 67, 5: 6, 7: 27 } } };
  const zep = { categoryA: "Led Zeppelin", categoryB: "My Little Pony", categoryAShareName: "Led Zeppelin 🎸", categoryBShareName: "My Little Pony 🦄" };

  it("is exactly the player's circles, the score with the dare, and the domain", () => {
    const { imageText } = shareTextsFor(zep, record8, crowd8);
    expect(imageText).toBe("🟢🟢🔴🟢🔴🟢🟢🔴\n5/8 ➜ Can you beat my score?!\nwhatthefudge.gg");
  });

  it("comes from the record itself: its own circles and its own score", () => {
    const record = { ...record8, score: 9, totalQuestions: 12, answers: [..."111011101101"].map((c, i) => ({ questionIndex: i, correct: c === "1" })) };
    expect(shareTextsFor(zep, record, null).imageText).toBe("🟢🟢🟢🔴🟢🟢🟢🔴🟢🟢🔴🟢\n9/12 ➜ Can you beat my score?!\nwhatthefudge.gg");
  });

  it("has no header, divider, category name, emoji label or OR", () => {
    const { imageText } = shareTextsFor(zep, record8, crowd8);
    for (const part of ["What The Fudge Trivia", "🍬", "━", "Led Zeppelin", "My Little Pony", "🎸", "🦄", "OR"]) {
      expect(imageText).not.toContain(part);
    }
    expect(imageText.split("\n")).toHaveLength(3);
  });

  it("never carries a percentage, with or without crowd stats", () => {
    for (const crowd of [null, crowd8, { ...crowd8, stats: { finishedPlayers: 1, scoreHistogram: { 5: 1 } } }]) {
      expect(shareTextsFor(zep, record8, crowd).imageText).toBe("🟢🟢🔴🟢🔴🟢🟢🔴\n5/8 ➜ Can you beat my score?!\nwhatthefudge.gg");
    }
  });

  it("has the full text's circles and domain, from the same result", () => {
    for (const crowd of [crowd8, null]) {
      const { text, imageText } = shareTextsFor(zep, record8, crowd);
      expect(text).toBe(shareTextFor(zep, record8, crowd));
      const full = text.split("\n");
      const short = imageText.split("\n");
      expect(full).toHaveLength(9);
      expect(short[0]).toBe(full[6]);
      expect(short[2]).toBe(full[8]);
    }
  });

  it("leaves the text-only share sheet, the desktop copy and the clipboard fallback on the full text", async () => {
    const { text, imageText } = shareTextsFor(GAME, RECORD, CROWD);
    expect(text).toBe(EXPECTED);
    const poster = { text, imageText, imageUrl: "https://x.test/poster.png" };
    const noFile = vi.fn().mockResolvedValue({ ok: false });
    const textOnly = nav(IPHONE, vi.fn().mockResolvedValue(undefined));
    const desktop = nav(WINDOWS, vi.fn());
    const fallback = nav(IPHONE, vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })));
    expect(await shareResult(poster, textOnly, { fetchImpl: noFile })).toBe("shared");
    expect(await shareResult(poster, desktop, { fetchImpl: noFile })).toBe("copied");
    expect(await shareResult(poster, fallback, { fetchImpl: noFile })).toBe("copied");
    expect(textOnly.share.mock.calls[0][0]).toEqual({ text: EXPECTED });
    expect(desktop.clipboard.writeText.mock.calls[0][0]).toBe(EXPECTED);
    expect(fallback.clipboard.writeText.mock.calls[0][0]).toBe(EXPECTED);
  });
});

describe("no old share format left in active share code", () => {
  const files = ["share.js", "crowdStats.js", "homeShare.js", "SharePreview.jsx", "App.jsx"];
  // The arrow is back only inside the image text's dare (SHARE_DARE).
  it.each(files)("%s has no old header, stray arrow or domain", (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8").replaceAll("➜ Can you beat my score?!", "");
    expect(source).not.toMatch(/WTF Trivia|➜|whatthefudgetrivia/);
  });
});
