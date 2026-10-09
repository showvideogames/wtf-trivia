// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import shareHandler from "../api/share.js";
import { clearShellCache } from "../api/puzzle.js";
import { parseResultCode, resultCode, resultCodeFromPath, resultShareFor, resultUrl, shareCopyText, resultUrlFor } from "./shareLink.js";
import { resultMeta } from "./shareResultMeta.js";
import { shareResult } from "./homeShare.js";

const SHELL = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ENV = { VITE_SUPABASE_URL: "https://db.test", VITE_SUPABASE_ANON_KEY: "anon-key" };
const ROW = {
  id: "g-cage", date: "2020-01-01", status: "published", theme_title: "Board Game or Nicolas Cage Movie?",
  category_a: "Board Games", category_b: "Nicolas Cage Movies",
  category_a_share_name: "", category_b_share_name: "",
  header_image: null, wide_image: "https://cdn.test/wide.webp",
};
const bits = (s) => [...s].map((c) => ({ correct: c === "1" }));
const A = "111110111111"; // 11/12
const B = "101001100110"; // 6/12

beforeEach(() => {
  clearShellCache();
});

const fakeFetch = (rows = [ROW]) => vi.fn(async (url) => {
  const u = String(url);
  if (u.includes("/index.html")) return new Response(SHELL, { status: 200, headers: { "content-type": "text/html" } });
  if (u.includes("/rest/v1/games")) return new Response(JSON.stringify(rows), { status: 200 });
  return new Response("", { status: 404 });
});
const fakeRes = () => ({
  statusCode: 0, headers: {}, body: null,
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
  end(body = "") { this.body = body; },
});
const call = async (handler, code, fetchImpl = fakeFetch()) => {
  const res = fakeRes();
  await handler({ url: `/api/x?code=${encodeURIComponent(code)}`, query: { code }, headers: { host: "whatthefudge.gg" } }, res, { fetchImpl, env: ENV });
  return res;
};
const tag = (html, prop) => new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html)?.[1];

describe("result codes", () => {
  it("round-trips and counts the score from the answers", () => {
    const code = resultCode("g-cage", bits(A));
    expect(code).toBe(`g-cage.${A}`);
    expect(parseResultCode(code)).toMatchObject({ puzzleId: "g-cage", score: 11, total: 12 });
    expect(resultUrl(code)).toBe(`https://whatthefudge.gg/s/g-cage.${A}`);
    expect(resultCodeFromPath(`/s/g-cage.${A}/`)).toBe(`g-cage.${A}`);
  });
  it("rejects unusable codes", () => {
    for (const bad of ["", "g-cage", "g-cage.", ".101", "g-cage.102", "g-cage.abc", `g-cage.${"1".repeat(41)}`, "a b.101", null]) {
      expect(parseResultCode(bad)).toBeNull();
    }
    expect(resultCodeFromPath("/s/nope")).toBe("");
    expect(resultCodeFromPath("/puzzle/x")).toBeNull();
    expect(resultUrlFor({ id: "g-cage" }, { answers: [] })).toBeNull();
  });
  it("different players get different addresses; the same result the same one", () => {
    expect(resultCode("g-cage", bits(A))).not.toBe(resultCode("g-cage", bits(B)));
    expect(resultCode("g-cage", bits(A))).toBe(resultCode("g-cage", bits(A)));
  });
});

describe("result page metadata (initial HTML)", () => {
  it("11/12 and 6/12 get different urls, text and images", async () => {
    const a = (await call(shareHandler, `g-cage.${A}`)).body;
    const b = (await call(shareHandler, `g-cage.${B}`)).body;
    expect(tag(a, "og:url")).toBe(`https://whatthefudge.gg/s/g-cage.${A}`);
    expect(tag(b, "og:url")).toBe(`https://whatthefudge.gg/s/g-cage.${B}`);
    // The picture is the quiz artwork alone, for every result.
    expect(tag(a, "og:image")).toBe("https://cdn.test/wide.webp");
    expect(tag(b, "og:image")).toBe("https://cdn.test/wide.webp");
    // The card is the artwork plus one plain line; the result is share text.
    expect(tag(a, "og:title")).toBe("Daily trivia. Two choices.");
    expect(tag(b, "og:title")).toBe("Daily trivia. Two choices.");
    expect(tag(a, "twitter:title")).toBe("Daily trivia. Two choices.");
    for (const html of [a, b]) {
      expect(html).not.toMatch(/og:description|twitter:description|name="description"/);
      expect(html).not.toMatch(/🟢|🔴|beat my score/);
    }
    expect(tag(a, "twitter:card")).toBe("summary_large_image");
    expect(tag(a, "twitter:image")).toBe(tag(a, "og:image"));
    // The matchup title is not visible text: only the page title and alt.
    expect(tag(a, "og:title")).not.toContain("Cage");
    expect(a).not.toMatch(/og:description[^>]*Cage|twitter:title" content="[^"]*Cage/);
    expect(a).toContain("<title>Board Game or Nicolas Cage Movie? ·");
  });
  it("unusable codes, unknown and unreleased puzzles get the plain site page", async () => {
    for (const [code, rows] of [["g-cage.xyz", [ROW]], [`g-none.${A}`, []], [`g-cage.${A}`, [{ ...ROW, status: "draft" }]], [`g-cage.${A}`, [{ ...ROW, date: "2999-01-01" }]]]) {
      const res = await call(shareHandler, code, fakeFetch(rows));
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-share-preview"]).toBe("site");
      expect(res.body).toBe(SHELL);
    }
  });
  it("rejects answers that don't match the puzzle's question count", async () => {
    const ok = await call(shareHandler, `g-cage.${A}`, fakeFetch([{ ...ROW, questions: new Array(12).fill({}) }]));
    expect(ok.headers["x-share-preview"]).toBe("result");
    const bad = await call(shareHandler, `g-cage.${A}`, fakeFetch([{ ...ROW, questions: new Array(8).fill({}) }]));
    expect(bad.headers["x-share-preview"]).toBe("site");
  });
  it("never echoes hostile text", () => {
    const meta = resultMeta({ ...ROW, themeTitle: '"><script>x</script>' }, parseResultCode(`g-cage.${A}`));
    expect(JSON.stringify(meta.title + meta.description)).not.toContain("script");
  });
});

describe("share payload", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1";
  const url = resultUrl(`g-cage.${A}`);
  const TEXT = "🟢🟢🟢🟢🟢🔴🟢🟢🟢🟢🟢🟢\n11/12 → Can you beat my score?!";
  const parts = () => resultShareFor({ id: "g-cage" }, { answers: bits(A) });
  it("is the unique link plus the circles and the score line, no title", () => {
    expect(parts()).toEqual({ url, text: TEXT });
    expect(parts().text).not.toContain("Cage");
  });
  it("the native share sheet gets the link and the result text", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { userAgent: IPHONE, maxTouchPoints: 5, share, clipboard: { writeText: vi.fn() } };
    expect(await shareResult(parts(), nav)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: TEXT, url });
  });
  it("desktop and the fallback copy exactly: link, circles, score line", async () => {
    const expected = `${url}\n🟢🟢🟢🟢🟢🔴🟢🟢🟢🟢🟢🟢\n11/12 → Can you beat my score?!`;
    const desktop = { userAgent: "Windows NT 10.0", clipboard: { writeText: vi.fn().mockResolvedValue() } };
    expect(await shareResult(parts(), desktop)).toBe("copied");
    expect(desktop.clipboard.writeText).toHaveBeenCalledWith(expected);
    expect(shareCopyText(parts())).toBe(expected);
    const failing = { userAgent: IPHONE, maxTouchPoints: 5, share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })), clipboard: { writeText: vi.fn().mockResolvedValue() } };
    expect(await shareResult(parts(), failing)).toBe("copied");
    expect(failing.clipboard.writeText).toHaveBeenCalledWith(expected);
  });
});
