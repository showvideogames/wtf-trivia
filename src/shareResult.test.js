// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Buffer } from "node:buffer";
import sharp from "sharp";
import shareHandler from "../api/share.js";
import imageHandler from "../api/share-image.js";
import { clearShellCache } from "../api/puzzle.js";
import { parseResultCode, resultCode, resultCodeFromPath, resultUrl, resultUrlFor } from "./shareLink.js";
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

let art;
beforeEach(async () => {
  clearShellCache();
  art = await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#7a3cff" } })
    .composite([{ input: Buffer.from('<svg width="1200" height="630"><rect x="100" y="100" width="1000" height="430" fill="#ff7ab8"/></svg>') }])
    .webp().toBuffer();
});

const fakeFetch = (rows = [ROW]) => vi.fn(async (url) => {
  const u = String(url);
  if (u.includes("/index.html")) return new Response(SHELL, { status: 200, headers: { "content-type": "text/html" } });
  if (u.includes("/rest/v1/games")) return new Response(JSON.stringify(rows), { status: 200 });
  if (u.includes("wide.webp")) return new Response(art, { status: 200 });
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
    expect(tag(a, "og:image")).toBe(`https://whatthefudge.gg/s/g-cage.${A}/og.png`);
    expect(tag(b, "og:image")).toBe(`https://whatthefudge.gg/s/g-cage.${B}/og.png`);
    expect(tag(a, "og:title")).toBe("11/12 ➜ Can you beat my score?!");
    expect(tag(b, "og:title")).toBe("6/12 ➜ Can you beat my score?!");
    expect(tag(a, "og:description")).toBe("🟢🟢🟢🟢🟢🔴🟢🟢🟢🟢🟢🟢");
    expect(tag(a, "twitter:card")).toBe("summary_large_image");
    expect(tag(a, "twitter:image")).toBe(tag(a, "og:image"));
    // The matchup title is not visible text: only the page title and alt.
    expect(tag(a, "og:title")).not.toContain("Cage");
    expect(tag(a, "og:description")).not.toContain("Cage");
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
    expect((await call(imageHandler, `g-cage.${A}`, fakeFetch([{ ...ROW, questions: new Array(8).fill({}) }]))).statusCode).toBe(404);
  });
  it("never echoes hostile text", () => {
    const meta = resultMeta({ ...ROW, themeTitle: '"><script>x</script>' }, parseResultCode(`g-cage.${A}`));
    expect(JSON.stringify(meta.title + meta.description)).not.toContain("script");
  });
});

describe("result image", () => {
  const png = async (code, rows) => {
    const res = await call(imageHandler, code, fakeFetch(rows));
    return res;
  };
  it("renders a different 1200x630 PNG per result, built on the quiz art", async () => {
    const a = await png(`g-cage.${A}`);
    const b = await png(`g-cage.${B}`);
    expect(a.statusCode).toBe(200);
    expect(a.headers["content-type"]).toBe("image/png");
    const meta = await sharp(a.body).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
    expect(Buffer.compare(a.body, b.body)).not.toBe(0);
    // The artwork's pink block is in the picture.
    const px = await sharp(a.body).extract({ left: 600, top: 150, width: 1, height: 1 }).raw().toBuffer();
    [0xff, 0x7a, 0xb8].forEach((v, i) => expect(Math.abs(px[i] - v)).toBeLessThan(4));
    const out = new URL("../.share-samples/", import.meta.url);
    mkdirSync(out, { recursive: true });
    writeFileSync(new URL("a-11of12.png", out), a.body);
    writeFileSync(new URL("b-6of12.png", out), b.body);
  });
  it("fails gracefully", async () => {
    expect((await png("g-cage.bad")).statusCode).toBe(404);
    expect((await png(`g-none.${A}`, [])).statusCode).toBe(404);
    expect((await png(`g-cage.${A}`, [{ ...ROW, status: "draft" }])).statusCode).toBe(404);
  });
});

describe("native share payload", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1";
  it("shares the link only, with no text above the preview", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { userAgent: IPHONE, maxTouchPoints: 5, share, clipboard: { writeText: vi.fn() } };
    const url = resultUrl(`g-cage.${A}`);
    expect(await shareResult({ url }, nav)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ url });
  });
  it("copies the link on desktop or when the share sheet fails", async () => {
    const url = resultUrl(`g-cage.${A}`);
    const desktop = { userAgent: "Windows NT 10.0", clipboard: { writeText: vi.fn().mockResolvedValue() } };
    expect(await shareResult({ url }, desktop)).toBe("copied");
    expect(desktop.clipboard.writeText).toHaveBeenCalledWith(url);
  });
});
