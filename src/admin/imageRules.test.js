import { describe, it, expect } from "vitest";
import {
  MAX_SOURCE_BYTES,
  NEW_UPLOAD_FORMATS,
  PROFILES,
  QUALITY_STEPS,
  canReuseOriginal,
  checkSourceSize,
  dimensionLadder,
  extensionForMime,
  fitWithin,
  formatBytes,
  judgeAttempts,
  orientedSize,
  percentSaved,
  preferOriginalOverEncoded,
  smallImageNote,
  sniffImage,
  summarize,
  validateSource,
} from "./imageRules.js";

/* ---- tiny byte builders: just enough header for the sniffer ---- */
const bytes = (...parts) => {
  const out = [];
  for (const p of parts) {
    if (typeof p === "string") for (const c of p) out.push(c.charCodeAt(0));
    else if (Array.isArray(p)) out.push(...p);
    else out.push(p);
  }
  return new Uint8Array(out);
};
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n) => [(n >>> 8) & 255, n & 255];
const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const le24 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

function png({ width = 800, height = 600, colorType = 6, chunks = [], end = true } = {}) {
  const chunk = (type, data = []) => [...be32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  return bytes(
    [0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a],
    chunk("IHDR", [...be32(width), ...be32(height), 8, colorType, 0, 0, 0]),
    ...chunks.map((t) => chunk(t, [0, 0, 0, 0])),
    chunk("IDAT", [1, 2, 3]),
    end ? chunk("IEND") : [],
  );
}

function jpeg({ width = 4032, height = 3024, orientation = null, complete = true, extraExif = false } = {}) {
  const parts = [[0xff, 0xd8]];
  const blocks = orientation ? [orientation] : [];
  if (extraExif) blocks.push(1);
  for (const orientation of blocks) {
    // APP1 "Exif\0\0" + little-endian TIFF header + one IFD entry (0x0112).
    const tiff = [..."II".split("").map((c) => c.charCodeAt(0)), 42, 0, ...le32(8), 1, 0,
      0x12, 0x01, 3, 0, ...le32(1), orientation, 0, 0, 0, ...le32(0)];
    const app1 = [..."Exif".split("").map((c) => c.charCodeAt(0)), 0, 0, ...tiff];
    parts.push([0xff, 0xe1, ...be16(app1.length + 2), ...app1]);
  }
  parts.push([0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  parts.push([0xff, 0xda, ...be16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]);
  parts.push([0x12, 0x34, 0xff, 0x00, 0x56]); // entropy data with a stuffed 0xFF
  if (complete) parts.push([0xff, 0xd9]);
  return bytes(...parts);
}

function webpVP8X({ width = 1200, height = 900, alpha = false, animated = false, riffSize = null, length = 30 } = {}) {
  const flags = (alpha ? 0x10 : 0) | (animated ? 0x02 : 0);
  const b = bytes("RIFF", le32(riffSize ?? length - 8), "WEBP", "VP8X", le32(10), flags, 0, 0, 0, le24(width - 1), le24(height - 1));
  return b;
}
function webpVP8({ width = 1024, height = 768 } = {}) {
  return bytes("RIFF", le32(22), "WEBP", "VP8 ", le32(10), [0, 0, 0, 0x9d, 0x01, 0x2a], width & 255, width >> 8, height & 255, height >> 8);
}

describe("sniffImage", () => {
  it("reads PNG size, alpha and completeness", () => {
    expect(sniffImage(png({ width: 1536, height: 1024, colorType: 6 }))).toMatchObject({ format: "png", width: 1536, height: 1024, mayHaveAlpha: true, complete: true, animated: false });
    expect(sniffImage(png({ colorType: 2 })).mayHaveAlpha).toBe(false);
    expect(sniffImage(png({ colorType: 2, chunks: ["tRNS"] })).mayHaveAlpha).toBe(true);
  });
  it("flags animated and truncated PNGs", () => {
    expect(sniffImage(png({ chunks: ["acTL"] })).animated).toBe(true);
    expect(sniffImage(png({ end: false })).complete).toBe(false);
  });
  it("reads JPEG size and EXIF orientation", () => {
    expect(sniffImage(jpeg())).toMatchObject({ format: "jpeg", width: 4032, height: 3024, orientation: 1, hasExif: false, complete: true });
    expect(sniffImage(jpeg({ orientation: 6 }))).toMatchObject({ orientation: 6, hasExif: true });
  });
  it("uses the first EXIF block's orientation, as browsers do", () => {
    expect(sniffImage(jpeg({ orientation: 6, extraExif: true })).orientation).toBe(6);
  });
  it("detects a JPEG that was cut off mid-download", () => {
    expect(sniffImage(jpeg({ complete: false })).complete).toBe(false);
  });
  it("reads WebP (VP8X and lossy VP8) and its flags", () => {
    expect(sniffImage(webpVP8X({ width: 1800, height: 1200, alpha: true }))).toMatchObject({ format: "webp", width: 1800, height: 1200, mayHaveAlpha: true, animated: false, complete: true });
    expect(sniffImage(webpVP8X({ animated: true })).animated).toBe(true);
    expect(sniffImage(webpVP8X({ riffSize: 5000 })).complete).toBe(false);
    expect(sniffImage(webpVP8({ width: 1024, height: 768 }))).toMatchObject({ format: "webp", width: 1024, height: 768 });
  });
  it("identifies formats by content, not by name", () => {
    expect(sniffImage(bytes("GIF89a", [0, 0, 0, 0, 0, 0])).format).toBe("gif");
    expect(sniffImage(bytes([0, 0, 0, 24], "ftypheic", [0, 0, 0, 0])).format).toBe("heic");
    expect(sniffImage(bytes([0, 0, 0, 24], "ftypmif1", [0, 0, 0, 0])).format).toBe("heic");
    expect(sniffImage(bytes([0, 0, 0, 24], "ftypavif", [0, 0, 0, 0])).format).toBe("avif");
    expect(sniffImage(bytes([0, 0, 0, 24], "ftypisom", [0, 0, 0, 0])).format).toBe("video");
    expect(sniffImage(bytes("8BPS", [0, 1, 0, 0, 0, 0, 0, 0, 0, 0])).format).toBe("psd");
    expect(sniffImage(bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')).format).toBe("svg");
    expect(sniffImage(bytes("<svg viewBox='0 0 1 1'></svg>")).format).toBe("svg");
    expect(sniffImage(bytes("%PDF-1.7 hello there")).format).toBe("pdf");
    expect(sniffImage(new Uint8Array(0)).format).toBe("empty");
    expect(sniffImage(bytes("just some text, not an image")).format).toBe("unknown");
  });
});

describe("validateSource", () => {
  const ok = (info, size = 1000) => validateSource({ size, info });
  it("accepts JPEG, PNG and WebP", () => {
    expect(ok(sniffImage(jpeg())).ok).toBe(true);
    expect(ok(sniffImage(png())).ok).toBe(true);
    expect(ok(sniffImage(webpVP8X())).ok).toBe(true);
  });
  it("accepts only JPEG, PNG and WebP for new uploads", () => {
    expect(NEW_UPLOAD_FORMATS).toEqual(["jpeg", "png", "webp"]);
  });
  it("refuses every other format and tells the admin to export JPEG, PNG or WebP", () => {
    for (const format of ["heic", "gif", "svg", "avif", "psd", "bmp", "tiff", "pdf", "video", "unknown"]) {
      const v = ok({ format, width: 800, height: 600, complete: true });
      expect(v.ok, format).toBe(false);
      expect(v.code, format).toBe("unsupported");
      expect(v.message, format).toMatch(/export it as a JPEG, PNG or WebP/i);
    }
    expect(ok({ format: "empty" }).code).toBe("unsupported");
  });
  it("refuses a real GIF, SVG and AVIF by content, however they are named", () => {
    const gif = sniffImage(bytes("GIF89a", [0x58, 0x02, 0x52, 0x01, 0, 0]));
    const svg = sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'));
    const avif = sniffImage(bytes([0, 0, 0, 24], "ftypavif", [0, 0, 0, 0]));
    for (const info of [gif, svg, avif]) expect(ok(info).ok, info.format).toBe(false);
  });
  it("only lets AVIF through for the publish-time URL import, which opts in", () => {
    const avif = { format: "avif", width: 0, height: 0, complete: true, animated: false };
    expect(validateSource({ size: 9000, info: avif }).ok).toBe(false);
    expect(validateSource({ size: 9000, info: avif }, { acceptAvif: true }).ok).toBe(true);
    expect(validateSource({ size: 9000, info: { format: "gif" } }, { acceptAvif: true }).ok).toBe(false);
  });
  it("refuses animation, corruption and truncation", () => {
    expect(ok(sniffImage(png({ chunks: ["acTL"] }))).code).toBe("animated");
    expect(ok(sniffImage(jpeg({ complete: false }))).code).toBe("corrupt");
    expect(ok(sniffImage(png({ end: false }))).code).toBe("corrupt");
    expect(ok({ format: "png", width: 0, height: 0, complete: true }).code).toBe("corrupt");
  });
  it("enforces the byte and pixel limits", () => {
    expect(checkSourceSize(MAX_SOURCE_BYTES).ok).toBe(true);
    const big = checkSourceSize(MAX_SOURCE_BYTES + 1);
    expect(big.ok).toBe(false);
    expect(big.message).toMatch(/25\.0 MB/);
    expect(ok(sniffImage(jpeg()), MAX_SOURCE_BYTES + 1).code).toBe("too-large");
    expect(ok(sniffImage(png({ width: 12000, height: 9000 }))).code).toBe("too-many-pixels");
    expect(ok(sniffImage(jpeg({ width: 8064, height: 6048 }))).ok).toBe(true); // 48 MP phone photo
  });
});

describe("dimensions", () => {
  it("fits inside the box, keeping the ratio", () => {
    expect(fitWithin(4032, 3024, 1200, 1200)).toMatchObject({ width: 1200, height: 900 });
    expect(fitWithin(3024, 4032, 1200, 1200)).toMatchObject({ width: 900, height: 1200 });
    expect(fitWithin(2172, 724, 1200, 1200)).toMatchObject({ width: 1200, height: 400 }); // legacy 3:1
    expect(fitWithin(3840, 2160, 1800, 1800)).toMatchObject({ width: 1800, height: 1013 });
    expect(fitWithin(4096, 4096, 1800, 1800)).toMatchObject({ width: 1800, height: 1800 });
  });
  it("never upscales", () => {
    expect(fitWithin(926, 722, 1200, 1200)).toMatchObject({ width: 926, height: 722, scale: 1 });
    expect(fitWithin(40, 30, 1800, 1800)).toMatchObject({ width: 40, height: 30 });
  });
  it("handles degenerate input without throwing", () => {
    expect(fitWithin(0, 0, 1200, 1200)).toMatchObject({ width: 0, height: 0 });
    expect(fitWithin(NaN, 10, 1200, 1200)).toMatchObject({ width: 0, height: 0 });
  });
  it("swaps width and height for rotated EXIF orientations", () => {
    expect(orientedSize(4032, 3024, 6)).toEqual({ width: 3024, height: 4032 });
    expect(orientedSize(4032, 3024, 8)).toEqual({ width: 3024, height: 4032 });
    expect(orientedSize(4032, 3024, 3)).toEqual({ width: 4032, height: 3024 });
    expect(orientedSize(4032, 3024, 1)).toEqual({ width: 4032, height: 3024 });
  });
  it("builds a shrinking ladder that stops at the minimum long edge", () => {
    const ladder = dimensionLadder(4032, 3024, PROFILES.question);
    expect(ladder[0]).toEqual({ width: 1200, height: 900 });
    expect(ladder.at(-1).width).toBe(PROFILES.question.minLongEdge);
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].width).toBeLessThan(ladder[i - 1].width);
      expect(Math.abs(ladder[i].width / ladder[i].height - 4 / 3)).toBeLessThan(0.01);
    }
    expect(dimensionLadder(800, 600, PROFILES.question)).toEqual([{ width: 800, height: 600 }]);
    const header = dimensionLadder(3840, 2160, PROFILES.header);
    expect(header[0]).toEqual({ width: 1800, height: 1013 });
    expect(header.at(-1).width).toBe(PROFILES.header.minLongEdge);
  });
});

describe("compression decisions", () => {
  const P = PROFILES.question; // target 250 KB
  const KB = 1024;
  const run = (sizesKB) => sizesKB.map((s, i) => ({ quality: QUALITY_STEPS[i], size: s * KB }));

  it("keeps the first (highest-quality) attempt that fits the target", () => {
    expect(judgeAttempts(run([180]), P, false)).toEqual({ done: true, pick: run([180])[0] });
    const r = judgeAttempts(run([300, 270, 240]), P, false);
    expect(r.done).toBe(true);
    expect(r.pick.quality).toBe(0.76);
  });
  it("keeps walking quality down while over target", () => {
    expect(judgeAttempts(run([400, 350]), P, false)).toEqual({ done: false });
  });
  it("prefers a little extra size over shrinking the image", () => {
    const r = judgeAttempts(run([420, 380, 340, 305, 290]), P, false); // 290 KB <= 1.25 x 250
    expect(r.done).toBe(true);
    expect(r.pick.size).toBe(305 * KB); // highest quality still within 1.25x
  });
  it("asks for a smaller size when far above target", () => {
    expect(judgeAttempts(run([900, 800, 700, 650, 600]), P, false)).toEqual({ done: false });
  });
  it("settles for the smallest result at the minimum size instead of crushing quality", () => {
    const r = judgeAttempts(run([900, 800, 700, 650, 600]), P, true);
    expect(r.done).toBe(true);
    expect(r.pick.size).toBe(600 * KB);
    expect(r.pick.quality).toBe(0.68);
  });
  it("never uses a quality below the floor", () => {
    expect(Math.min(...QUALITY_STEPS)).toBeGreaterThanOrEqual(0.68);
    expect(QUALITY_STEPS[0]).toBe(0.84);
  });
});

describe("reusing an already-optimized file", () => {
  const P = PROFILES.question;
  it("reuses a small WebP that already fits", () => {
    const info = sniffImage(webpVP8({ width: 1024, height: 768 }));
    expect(canReuseOriginal({ info, size: 129 * 1024 }, P)).toBe(true);
  });
  it("re-encodes a WebP that is too big in bytes or dimensions, or animated", () => {
    expect(canReuseOriginal({ info: sniffImage(webpVP8({ width: 1024, height: 768 })), size: 400 * 1024 }, P)).toBe(false);
    expect(canReuseOriginal({ info: sniffImage(webpVP8X({ width: 1600, height: 1200 })), size: 100 * 1024 }, P)).toBe(false);
    expect(canReuseOriginal({ info: sniffImage(webpVP8X({ animated: true })), size: 10 }, P)).toBe(false);
  });
  it("never reuses JPEG or PNG outright", () => {
    expect(canReuseOriginal({ info: sniffImage(jpeg({ width: 800, height: 600 })), size: 50 * 1024 }, P)).toBe(false);
    expect(canReuseOriginal({ info: sniffImage(png({ width: 800, height: 600 })), size: 50 * 1024 }, P)).toBe(false);
  });
  it("keeps a lean source when re-encoding would make it bigger, unless it carries EXIF or needs rotating", () => {
    const small = sniffImage(png({ width: 400, height: 300, colorType: 3 }));
    expect(preferOriginalOverEncoded({ info: small, size: 9000 }, 12000, P)).toBe(true);
    expect(preferOriginalOverEncoded({ info: small, size: 9000 }, 8000, P)).toBe(false);
    const phone = sniffImage(jpeg({ width: 800, height: 600, orientation: 6 }));
    expect(preferOriginalOverEncoded({ info: phone, size: 9000 }, 12000, P)).toBe(false);
    const avif = { format: "avif", width: 400, height: 400, orientation: 1, hasExif: false, animated: false };
    expect(preferOriginalOverEncoded({ info: avif, size: 9000 }, 16000, P)).toBe(false); // always delivered as WebP
    const tooWide = sniffImage(png({ width: 3000, height: 1000 }));
    expect(preferOriginalOverEncoded({ info: tooWide, size: 9000 }, 12000, P)).toBe(false);
  });
});

describe("admin summary", () => {
  it("formats the before/after line", () => {
    const text = summarize({
      original: { width: 4032, height: 3024, size: 6.4 * 1024 * 1024 },
      width: 1200, height: 900, size: 218 * 1024, mime: "image/webp", reused: false,
    });
    expect(text).toBe("4032 × 3024, 6.4 MB → 1200 × 900 WebP, 218 KB (97% smaller)");
  });
  it("says when a file was uploaded unchanged", () => {
    const text = summarize({ original: { width: 1024, height: 768, size: 129 * 1024 }, width: 1024, height: 768, size: 129 * 1024, mime: "image/webp", reused: true });
    expect(text).toBe("1024 × 768, 129 KB WebP — already optimized, uploaded unchanged");
  });
  it("formats sizes and percentages", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(218 * 1024)).toBe("218 KB");
    expect(formatBytes(2.25 * 1024 * 1024)).toBe("2.3 MB");
    expect(percentSaved(1000, 30)).toBe(97);
    expect(percentSaved(0, 30)).toBe(0);
  });
  it("maps MIME types to file extensions", () => {
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/gif")).toBe(null);
  });
  it("notes small images without blocking them", () => {
    expect(smallImageNote(400, 300, PROFILES.question)).toMatch(/400 × 300/);
    expect(smallImageNote(1200, 900, PROFILES.question)).toBe(null);
  });
});
