import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import SharePreview from "./SharePreview.jsx";
import { buildResultsShareText } from "./share.js";
import { copyText, shareResult } from "./homeShare.js";

// Every share route must carry the one formatter's string, character for
// character: the Results preview and copy button, Home's desktop copy, the
// native share sheet on phones, and the clipboard fallback.

const GAME = {
  id: "g-cage",
  categoryA: "Nicolas Cage Movies", categoryB: "Board Games",
  categoryAShareName: "Nicolas Cage Movie 🤩🎬", categoryBShareName: "Board Game 🎲♟️",
};
const answers = [..."110011001111"].map((c, i) => ({ questionIndex: i, correct: c === "1" }));
const RECORD = { puzzleId: "g-cage", date: "2026-09-27", score: 8, totalQuestions: 12, answers, completed: true };
const EXPECTED = "🟢🟢🔴🔴🟢🟢🔴🔴🟢🟢🟢🟢\n8/12 ➜ Can you beat my score?!\nhttps://whatthefudge.gg/puzzle/g-cage";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const nav = (userAgent, share) => ({
  userAgent, maxTouchPoints: userAgent === IPHONE ? 5 : 0,
  ...(share ? { share } : {}),
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});
const share = (text, n) => shareResult({ text }, n);

// The preview's text content, as a browser would give it.
const previewText = (text) => {
  const html = renderToStaticMarkup(<SharePreview text={text}/>);
  return html.replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
};

describe("all share routes use the formatter's exact string", () => {
  it("Results preview, Results copy, Home copy, native share and clipboard fallback", async () => {
    // Results and Home each build the text the way App.jsx does.
    const resultsText = buildResultsShareText({ game: GAME, record: { ...RECORD } });
    const homeText = buildResultsShareText({ game: GAME, record: RECORD });
    expect(resultsText).toBe(EXPECTED);
    expect(homeText).toBe(EXPECTED);

    expect(previewText(resultsText)).toBe(EXPECTED);

    const resultsCopy = nav(WINDOWS);
    expect(await copyText(resultsText, resultsCopy)).toBe("copied");

    const homeDesktop = nav(WINDOWS, vi.fn().mockResolvedValue(undefined));
    expect(await share(homeText, homeDesktop)).toBe("copied");

    const homePhone = nav(IPHONE, vi.fn().mockResolvedValue(undefined));
    expect(await share(homeText, homePhone)).toBe("shared");

    const fallback = nav(IPHONE, vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })));
    expect(await share(homeText, fallback)).toBe("copied");

    const sent = [
      resultsCopy.clipboard.writeText.mock.calls[0][0],
      homeDesktop.clipboard.writeText.mock.calls[0][0],
      homePhone.share.mock.calls[0][0].text,
      fallback.clipboard.writeText.mock.calls[0][0],
    ];
    for (const text of sent) expect(text).toBe(EXPECTED);
  });

  it("gives the share sheet only the text, link included: no title, url or files", async () => {
    const phone = nav(IPHONE, vi.fn().mockResolvedValue(undefined));
    await share(EXPECTED, phone);
    expect(Object.keys(phone.share.mock.calls[0][0])).toEqual(["text"]);
    expect(phone.share.mock.calls[0][0].text.split("\n").at(-1)).toBe("https://whatthefudge.gg/puzzle/g-cage");
  });

  it("links an earlier puzzle to itself, not to today's", () => {
    const older = { ...GAME, id: "g-older", date: "2026-09-01" };
    const text = buildResultsShareText({ game: older, record: { ...RECORD, puzzleId: "g-older" } });
    expect(text.split("\n")[2]).toBe("https://whatthefudge.gg/puzzle/g-older");
    expect(previewText(text)).toBe(text);
  });
});

describe("no old share format left in active share code", () => {
  const files = ["share.js", "crowdStats.js", "homeShare.js", "SharePreview.jsx", "App.jsx"];
  // The arrow appears only inside the dare (SHARE_DARE).
  it.each(files)("%s has no old header, stray arrow or domain", (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8").replaceAll("➜ Can you beat my score?!", "");
    expect(source).not.toMatch(/WTF Trivia|➜|whatthefudgetrivia/);
  });

  it.each(["share.js", "crowdStats.js", "homeShare.js", "App.jsx"])("%s has no image-file share or nine-line text", (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/prepareShareImages?\(|buildImageShareText|SHARE_DIVIDER|SHARE_HEADER|imageText/);
  });
});
