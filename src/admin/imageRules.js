/* ============================================================
   Admin image-upload rules. Pure functions only -- no DOM, no canvas --
   so every decision the optimizer makes can be unit-tested in Node.

   Imported only by imageOptimizer.js, which the Admin uploader loads with
   a dynamic import(), so none of this ships in the player-facing bundle.
   ============================================================ */

const KB = 1024;
const MB = 1024 * 1024;

// Refuse anything bigger before reading it at all. 25 MB covers a 48 MP
// phone JPEG (~10-15 MB) and a 4096 x 4096 AI-tool PNG (~20 MB) with room to
// spare, while stopping a stray RAW/TIFF/video from freezing the tab.
export const MAX_SOURCE_BYTES = 25 * MB;
// Decoded RGBA costs 4 bytes a pixel, so 50 MP is ~200 MB of memory for the
// moment it is decoded. That still admits 48 MP phone photos (8064 x 6048)
// but refuses decompression bombs: small files that claim enormous sizes.
export const MAX_SOURCE_PIXELS = 50_000_000;

// Quality ladder for the WebP search. Starts high enough for text and faces
// in colourful generated artwork and never goes below 0.68.
export const QUALITY_STEPS = [0.84, 0.8, 0.76, 0.72, 0.68];
// When even the lowest quality misses the target, a result this close to it
// is kept at the best quality that fits, rather than shrinking the image.
export const NEAR_TARGET_FACTOR = 1.25;
// Each dimension-reduction pass shrinks the long edge by this much.
export const DOWNSCALE_STEP = 0.85;

export const PROFILES = {
  // Reveal art. Rendered at most ~373 x 280 CSS px (4:3 at the gameplay
  // height cap), i.e. ~1120 x 840 device px on a 3x phone.
  question: {
    label: "question image",
    maxWidth: 1200,
    maxHeight: 1200,
    targetBytes: 250 * KB,
    minLongEdge: 960,
    smallLongEdge: 600,
  },
  // Home (cover, 2.05:1 phone / 2.75:1 desktop, up to 840 x 305 CSS px) and
  // the Archive "today" card (contain, 3:2, up to 960 x 640 CSS px).
  header: {
    label: "header image",
    maxWidth: 1800,
    maxHeight: 1800,
    targetBytes: 500 * KB,
    minLongEdge: 1400,
    smallLongEdge: 900,
  },
  // Answer-button squares (128 CSS px on phones) and the split fallback art
  // (up to ~420 x 305 CSS px per half).
  category: {
    label: "category image",
    maxWidth: 1200,
    maxHeight: 1200,
    targetBytes: 200 * KB,
    minLongEdge: 800,
    smallLongEdge: 400,
  },
};
export function getProfile(name) {
  return PROFILES[name] || PROFILES.question;
}

export const MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};
export function extensionForMime(mime) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[mime] || null;
}

const ascii = (b, start, len) => String.fromCharCode(...b.subarray(start, start + len));
const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u32be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u16le = (b, o) => b[o] | (b[o + 1] << 8);
const u24le = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0);

function readExifOrientation(b, tiffStart) {
  if (tiffStart + 8 > b.length) return 1;
  const order = ascii(b, tiffStart, 2);
  if (order !== "II" && order !== "MM") return 1;
  const le = order === "II";
  const r16 = (o) => (le ? u16le(b, o) : u16be(b, o));
  const r32 = (o) => (le ? u32le(b, o) : u32be(b, o));
  const ifd = tiffStart + r32(tiffStart + 4);
  if (ifd + 2 > b.length) return 1;
  const count = r16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 10 > b.length) break;
    if (r16(entry) === 0x0112) {
      const v = r16(entry + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

function sniffJpeg(b) {
  const info = { format: "jpeg", width: 0, height: 0, orientation: 1, hasExif: false, mayHaveAlpha: false, animated: false, complete: false };
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = u16be(b, i + 2);
    // Only the first Exif block counts, as it does for browsers; editors
    // sometimes leave a second one behind with no orientation in it.
    if (marker === 0xe1 && !info.hasExif && ascii(b, i + 4, 4) === "Exif") {
      info.hasExif = true;
      info.orientation = readExifOrientation(b, i + 10);
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && i + 9 <= b.length) {
      info.height = u16be(b, i + 5);
      info.width = u16be(b, i + 7);
    }
    if (marker === 0xda) {
      // Entropy-coded data follows. 0xFF inside it is always byte-stuffed,
      // so an FF D9 anywhere after here is the end-of-image marker. A file
      // cut off mid-download never has one, even though browsers will often
      // still "decode" it into a half-grey image without any error.
      for (let j = i + 2 + len; j + 1 < b.length; j++) {
        if (b[j] === 0xff && b[j + 1] === 0xd9) { info.complete = true; break; }
      }
      break;
    }
    i += 2 + len;
  }
  return info;
}

function sniffPng(b) {
  const info = { format: "png", width: 0, height: 0, orientation: 1, hasExif: false, mayHaveAlpha: false, animated: false, complete: false };
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR") return info;
  info.width = u32be(b, 16);
  info.height = u32be(b, 20);
  const colorType = b[25];
  info.mayHaveAlpha = colorType === 4 || colorType === 6;
  let o = 8;
  while (o + 8 <= b.length) {
    const len = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    if (type === "tRNS") info.mayHaveAlpha = true;
    if (type === "acTL") info.animated = true;
    if (type === "eXIf") info.hasExif = true;
    if (type === "IEND") { info.complete = true; break; }
    o += 12 + len;
  }
  return info;
}

function sniffWebp(b) {
  const info = { format: "webp", width: 0, height: 0, orientation: 1, hasExif: false, mayHaveAlpha: false, animated: false, complete: false };
  const riffSize = u32le(b, 4);
  info.complete = b.length >= riffSize + 8;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X" && b.length >= 30) {
    const flags = b[20];
    info.mayHaveAlpha = Boolean(flags & 0x10);
    info.animated = Boolean(flags & 0x02);
    info.hasExif = Boolean(flags & 0x08);
    info.width = 1 + u24le(b, 24);
    info.height = 1 + u24le(b, 27);
  } else if (chunk === "VP8L" && b.length >= 25) {
    const v = u32le(b, 21);
    info.width = (v & 0x3fff) + 1;
    info.height = ((v >>> 14) & 0x3fff) + 1;
    info.mayHaveAlpha = Boolean((v >>> 28) & 1);
  } else if (chunk === "VP8 " && b.length >= 30) {
    info.width = u16le(b, 26) & 0x3fff;
    info.height = u16le(b, 28) & 0x3fff;
  }
  return info;
}

/**
 * Identify an image from its leading bytes (never trust the file name or
 * the browser-reported MIME type -- files named .jpg that are really WebP,
 * or .png files that are really Photoshop documents, are both common).
 *
 * @param {Uint8Array} bytes - the file's bytes (the whole file lets JPEG and
 *   PNG truncation be detected; the first ~64 KB is enough for everything else)
 */
export function sniffImage(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 12) return { format: b.length === 0 ? "empty" : "unknown" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return sniffJpeg(b);
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return sniffPng(b);
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return sniffWebp(b);
  if (ascii(b, 0, 3) === "GIF") return { format: "gif" };
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (brand === "avif" || brand === "avis") return { format: "avif", width: 0, height: 0, orientation: 1, hasExif: false, mayHaveAlpha: true, animated: brand === "avis", complete: true };
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return { format: "heic" };
    return { format: "video" };
  }
  if (ascii(b, 0, 4) === "8BPS") return { format: "psd" };
  if (ascii(b, 0, 2) === "BM") return { format: "bmp" };
  if (ascii(b, 0, 4) === "II*\0" || ascii(b, 0, 4) === "MM\0*") return { format: "tiff" };
  if (ascii(b, 0, 4) === "%PDF") return { format: "pdf" };
  const head = ascii(b, 0, Math.min(b.length, 256)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return { format: "svg" };
  return { format: "unknown" };
}

// Formats a newly selected Admin file may be. Everything else is refused,
// never uploaded as-is, so nothing can bypass resizing and compression.
// (Existing puzzles that already reference other formats are unaffected:
// this only gates new uploads.)
export const NEW_UPLOAD_FORMATS = ["jpeg", "png", "webp"];

const EXPORT_AS = "Please export it as a JPEG, PNG or WebP and upload that instead.";
const UNSUPPORTED_MESSAGES = {
  heic: `This is a HEIC photo (the iPhone default), which can't be used here. ${EXPORT_AS} On a Mac: open it in Preview, then File > Export.`,
  gif: `GIFs aren't accepted for new uploads. ${EXPORT_AS}`,
  svg: `SVG files aren't accepted for new uploads. ${EXPORT_AS} Choose PNG to keep transparency.`,
  avif: `AVIF images aren't accepted for new uploads. ${EXPORT_AS}`,
  psd: `This looks like a Photoshop file, even though it's named like an image. ${EXPORT_AS}`,
  bmp: `BMP images aren't accepted. ${EXPORT_AS}`,
  tiff: `TIFF images aren't accepted. ${EXPORT_AS}`,
  pdf: `That's a PDF, not an image. ${EXPORT_AS}`,
  video: `That looks like a video file. For video, paste a YouTube link in the URL tab. For a still image, ${EXPORT_AS.replace("Please export", "please export")}`,
  empty: "That file is empty (0 bytes). Try saving or downloading it again.",
  unknown: `That file isn't an image this site can use. ${EXPORT_AS}`,
};

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "?";
  if (n < KB) return `${n} B`;
  if (n < MB) return `${Math.round(n / KB)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}

/** The byte limit, checked before a file is read at all. */
export function checkSourceSize(size) {
  if (Number.isFinite(size) && size > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      code: "too-large",
      message: `This file is ${formatBytes(size)}, over the ${formatBytes(MAX_SOURCE_BYTES)} limit. Please export a smaller copy. About 3000 pixels on the long edge is plenty.`,
    };
  }
  return { ok: true };
}

/**
 * Decide whether a source file may be processed at all, before any decode.
 * Only JPEG, PNG and WebP are accepted. `acceptAvif` exists solely so the
 * separate publish-time import of pasted URLs keeps its current behaviour
 * (it converted AVIF to WebP); new Admin uploads never pass it.
 * Returns {ok:true, info} or {ok:false, code, message}.
 */
export function validateSource({ size, info }, { acceptAvif = false } = {}) {
  const sized = checkSourceSize(size);
  if (!sized.ok) return sized;
  const format = info?.format || "unknown";
  const accepted = NEW_UPLOAD_FORMATS.includes(format) || (acceptAvif && format === "avif");
  if (!accepted) {
    return { ok: false, code: "unsupported", message: UNSUPPORTED_MESSAGES[format] || UNSUPPORTED_MESSAGES.unknown };
  }
  if (info.animated) {
    return { ok: false, code: "animated", message: `Animated images aren't accepted. Export a single still frame as a JPEG, PNG or WebP and upload that instead.` };
  }
  if (format !== "avif" && (!info.width || !info.height || info.complete === false)) {
    return { ok: false, code: "corrupt", message: "This image couldn't be read. The file may be damaged or only partly downloaded. Try exporting or downloading it again." };
  }
  if (info.width * info.height > MAX_SOURCE_PIXELS) {
    const mp = Math.round((info.width * info.height) / 1e6);
    return {
      ok: false,
      code: "too-many-pixels",
      message: `This image is ${info.width} × ${info.height} (${mp} megapixels), too big to process safely in the browser. Please resize it to under 8000 pixels on the long edge first.`,
    };
  }
  return { ok: true, info };
}

/** EXIF orientations 5-8 rotate the picture by 90 degrees. */
export function orientedSize(width, height, orientation = 1) {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

/** The largest size that fits inside maxW x maxH, keeping the aspect ratio. Never upscales. */
export function fitWithin(width, height, maxWidth, maxHeight) {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0, scale: 1 };
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * The output sizes to try, largest first: the fitted size, then successively
 * smaller ones (same ratio) down to the profile's minimum long edge. An image
 * already at or below that minimum only ever gets its own fitted size.
 */
export function dimensionLadder(width, height, profile) {
  const first = fitWithin(width, height, profile.maxWidth, profile.maxHeight);
  const ladder = [{ width: first.width, height: first.height }];
  const longEdge = Math.max(first.width, first.height);
  if (longEdge <= profile.minLongEdge) return ladder;
  let edge = longEdge;
  while (edge > profile.minLongEdge) {
    edge = Math.max(profile.minLongEdge, Math.round(edge * DOWNSCALE_STEP));
    const s = edge / longEdge;
    ladder.push({ width: Math.max(1, Math.round(first.width * s)), height: Math.max(1, Math.round(first.height * s)) });
  }
  return ladder;
}

/**
 * A WebP that is already inside the box and at or under the target size is
 * uploaded byte-for-byte: re-encoding it could only lose quality.
 */
export function canReuseOriginal({ info, size }, profile) {
  if (!info || info.format !== "webp" || info.animated) return false;
  if (info.width > profile.maxWidth || info.height > profile.maxHeight) return false;
  return size <= profile.targetBytes;
}

/**
 * When a re-encode comes out *larger* than a small source (a tiny, flat PNG
 * or an already-lean JPEG), the source is kept instead -- but only if it
 * needs no resize and no rotation, and carries no EXIF block (which can
 * hold a phone's GPS location; re-encoding strips it).
 */
export function preferOriginalOverEncoded({ info, size }, encodedSize, profile) {
  // AVIF is accepted as a source but always delivered as WebP, which every
  // browser the site supports can show.
  if (!info || !MIME_BY_FORMAT[info.format] || info.format === "avif" || info.animated) return false;
  if (info.hasExif || (info.orientation || 1) !== 1) return false;
  if (info.width > profile.maxWidth || info.height > profile.maxHeight) return false;
  return size <= encodedSize;
}

/**
 * Given the attempts made so far at one size (in QUALITY_STEPS order), say
 * whether to stop and which attempt to keep. `isLastSize` is true when no
 * smaller size is left to try.
 *
 * - The first (highest-quality) attempt within the target wins.
 * - If none fits, but one is within NEAR_TARGET_FACTOR of it, keep the
 *   highest-quality such attempt instead of shrinking the image.
 * - Otherwise shrink and try again; at the smallest size, keep the smallest
 *   result (never go below the quality floor to force a number).
 *
 * @returns {{done:boolean, pick?:object}}
 */
export function judgeAttempts(attempts, profile, isLastSize) {
  const withinTarget = attempts.find((a) => a.size <= profile.targetBytes);
  if (withinTarget) return { done: true, pick: withinTarget };
  if (attempts.length < QUALITY_STEPS.length) return { done: false };
  const near = attempts.find((a) => a.size <= profile.targetBytes * NEAR_TARGET_FACTOR);
  if (near) return { done: true, pick: near };
  if (!isLastSize) return { done: false };
  return { done: true, pick: attempts.reduce((best, a) => (a.size < best.size ? a : best)) };
}

/** Output encoding when the browser can't write WebP (older Safari). */
export function fallbackMime(hasAlpha) {
  return hasAlpha ? "image/png" : "image/jpeg";
}

export function percentSaved(before, after) {
  if (!(before > 0)) return 0;
  return Math.round((1 - after / before) * 100);
}

const FORMAT_LABEL = { "image/webp": "WebP", "image/jpeg": "JPEG", "image/png": "PNG", "image/avif": "AVIF" };

/** e.g. "4032 × 3024, 6.4 MB → 1200 × 900 WebP, 218 KB (97% smaller)" */
export function summarize(result) {
  const o = result.original;
  const fmt = FORMAT_LABEL[result.mime] || result.mime;
  const before = `${o.width} × ${o.height}, ${formatBytes(o.size)}`;
  if (result.reused) return `${before} ${fmt} — already optimized, uploaded unchanged`;
  const after = `${result.width} × ${result.height} ${fmt}, ${formatBytes(result.size)}`;
  const pct = percentSaved(o.size, result.size);
  const change = pct > 0 ? `${pct}% smaller` : pct < 0 ? `${-pct}% larger` : "same size";
  return `${before} → ${after} (${change})`;
}

/** A gentle, non-blocking note for images that will look soft on big screens. */
export function smallImageNote(width, height, profile) {
  const longEdge = Math.max(width, height);
  if (longEdge >= profile.smallLongEdge) return null;
  return `Heads up: at ${width} × ${height} this may look soft on large screens. It was kept at its own size (never upscaled).`;
}
