/* ============================================================
   Admin image optimizer: validate, orient, resize and compress one image
   in the browser, using only native APIs (createImageBitmap, canvas,
   toBlob). All of the decisions live in imageRules.js; this file only does
   the pixel work.

   Loaded on demand with import() from the Admin uploader, so it never
   ships in the player-facing bundle.
   ============================================================ */

import {
  MIME_BY_FORMAT,
  QUALITY_STEPS,
  canReuseOriginal,
  checkSourceSize,
  dimensionLadder,
  extensionForMime,
  fallbackMime,
  getProfile,
  judgeAttempts,
  orientedSize,
  preferOriginalOverEncoded,
  smallImageNote,
  sniffImage,
  summarize,
  validateSource,
  MAX_SOURCE_PIXELS,
} from "./imageRules.js";

/** An error whose message is safe and friendly to show the admin as-is. */
export class ImageOptimizeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ImageOptimizeError";
    this.code = code;
  }
}

const CORRUPT_MESSAGE =
  "This image couldn't be read. The file may be damaged or only partly downloaded. Try exporting or downloading it again.";

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
// Setting a canvas to 0 x 0 hands its backing store back straight away
// instead of waiting for garbage collection -- it matters on phones.
function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

// Safari before 17 silently writes PNG when asked for WebP, so this checks
// what actually comes back rather than trusting the request.
let webpSupport = null;
function supportsWebpEncoding() {
  if (!webpSupport) {
    webpSupport = (async () => {
      const probe = makeCanvas(2, 2);
      const blob = await canvasToBlob(probe, "image/webp", 0.8);
      releaseCanvas(probe);
      return blob?.type === "image/webp";
    })();
  }
  return webpSupport;
}

// Decodes with EXIF orientation applied, so a sideways phone photo comes out
// upright. createImageBitmap first (fast, off the main thread where
// supported); an <img> element as the fallback for engines without it.
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
    } catch {
      // Fall through to the <img> path, which some engines decode more leniently.
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageOptimizeError("corrupt", CORRUPT_MESSAGE);
  }
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => {
      URL.revokeObjectURL(url);
      img.src = "";
    },
  };
}

// Big reductions (e.g. 4000 px -> 1200 px) are done in halving steps first,
// so every engine averages the pixels it drops instead of skipping them.
// That keeps fine text and hair from turning jagged or shimmery.
function drawScaled(source, sourceWidth, sourceHeight, width, height) {
  const temps = [];
  let current = source;
  let cw = sourceWidth;
  let ch = sourceHeight;
  while (cw / 2 >= width && ch / 2 >= height) {
    const step = makeCanvas(Math.round(cw / 2), Math.round(ch / 2));
    const sctx = step.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(current, 0, 0, step.width, step.height);
    temps.push(step);
    current = step;
    cw = step.width;
    ch = step.height;
  }
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageOptimizeError("no-canvas", "This browser couldn't process the image. Try the latest Chrome, Edge, Firefox or Safari.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, 0, 0, width, height);
  temps.forEach(releaseCanvas);
  return canvas;
}

function hasTransparentPixels(canvas) {
  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

async function readBytes(file) {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new ImageOptimizeError("unreadable", "That file couldn't be opened. If it's stored in the cloud (OneDrive, iCloud), download it to this device first.");
  }
}

/**
 * Optimize one image for upload.
 *
 * @param {Blob} file - the chosen file (or a fetched Blob)
 * @param {"question"|"header"|"category"} profileName
 * @param {{onStage?: (stage:"checking"|"optimizing") => void, acceptAvif?: boolean}} [options]
 *   acceptAvif is only for the publish-time import of pasted URLs; new
 *   uploads accept JPEG, PNG and WebP only.
 * @returns {Promise<object>} {blob, mime, ext, width, height, size, quality,
 *   reused, hasAlpha, orientationCorrected, original, attempts, note, summary}
 * @throws {ImageOptimizeError} with an admin-friendly message
 */
export async function optimizeImage(file, profileName, { onStage, acceptAvif = false } = {}) {
  const profile = getProfile(profileName);
  onStage?.("checking");

  // Size gate first, so an enormous file is never read into memory.
  const sized = checkSourceSize(file.size);
  if (!sized.ok) throw new ImageOptimizeError(sized.code, sized.message);

  const bytes = await readBytes(file);
  const info = sniffImage(bytes);
  const verdict = validateSource({ size: bytes.length, info }, { acceptAvif });
  if (!verdict.ok) throw new ImageOptimizeError(verdict.code, verdict.message);

  const sourceMime = MIME_BY_FORMAT[info.format];
  const upright = orientedSize(info.width, info.height, info.orientation);
  const original = { width: upright.width, height: upright.height, size: bytes.length, format: info.format, mime: sourceMime };
  const orientationCorrected = (info.orientation || 1) !== 1;

  if (canReuseOriginal({ info, size: bytes.length }, profile)) {
    const blob = new Blob([bytes], { type: sourceMime });
    const result = {
      blob, mime: sourceMime, ext: extensionForMime(sourceMime),
      width: info.width, height: info.height, size: blob.size, quality: null,
      reused: true, hasAlpha: info.mayHaveAlpha, orientationCorrected: false,
      original, attempts: [], note: smallImageNote(info.width, info.height, profile),
    };
    return { ...result, summary: summarize(result) };
  }

  onStage?.("optimizing");
  const decoded = await decodeImage(new Blob([bytes], { type: sourceMime })).catch((e) => {
    throw e instanceof ImageOptimizeError ? e : new ImageOptimizeError("corrupt", CORRUPT_MESSAGE);
  });
  let canvas = null;
  try {
    const { source, width: srcW, height: srcH } = decoded;
    if (!srcW || !srcH) throw new ImageOptimizeError("corrupt", CORRUPT_MESSAGE);
    if (srcW * srcH > MAX_SOURCE_PIXELS) {
      throw new ImageOptimizeError("too-many-pixels", `This image is ${srcW} × ${srcH}, too big to process safely in the browser. Please resize it to under 8000 pixels on the long edge first.`);
    }
    original.width = srcW;
    original.height = srcH;

    const ladder = dimensionLadder(srcW, srcH, profile);
    const webp = await supportsWebpEncoding();
    let hasAlpha = null;
    let mime = "image/webp";
    const tried = [];
    let pick = null;

    for (let s = 0; s < ladder.length && !pick; s++) {
      const { width, height } = ladder[s];
      releaseCanvas(canvas);
      canvas = drawScaled(source, srcW, srcH, width, height);
      if (hasAlpha === null) {
        hasAlpha = info.mayHaveAlpha ? hasTransparentPixels(canvas) : false;
        if (!webp) mime = fallbackMime(hasAlpha);
      }
      const isLastSize = s === ladder.length - 1;
      if (mime === "image/png") {
        // Lossless fallback: quality has no effect, so one attempt is final.
        const blob = await canvasToBlob(canvas, mime);
        if (!blob) break;
        pick = { width, height, quality: null, size: blob.size, blob };
        tried.push(pick);
        break;
      }
      const attempts = [];
      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, mime, quality);
        if (!blob || blob.type !== mime) break;
        const attempt = { width, height, quality, size: blob.size, blob };
        attempts.push(attempt);
        tried.push(attempt);
        const judged = judgeAttempts(attempts, profile, isLastSize);
        if (judged.done) {
          pick = judged.pick;
          break;
        }
      }
      if (!attempts.length) break;
    }
    if (!pick) throw new ImageOptimizeError("encode-failed", "This browser couldn't compress the image. Try the latest Chrome, Edge, Firefox or Safari.");

    const summaryAttempts = tried.map(({ width, height, quality, size }) => ({ width, height, quality, size }));
    if (preferOriginalOverEncoded({ info, size: bytes.length }, pick.size, profile)) {
      const blob = new Blob([bytes], { type: sourceMime });
      const result = {
        blob, mime: sourceMime, ext: extensionForMime(sourceMime),
        width: srcW, height: srcH, size: blob.size, quality: null,
        reused: true, hasAlpha: Boolean(hasAlpha), orientationCorrected: false,
        original, attempts: summaryAttempts, note: smallImageNote(srcW, srcH, profile),
      };
      return { ...result, summary: summarize(result) };
    }

    const result = {
      blob: pick.blob, mime, ext: extensionForMime(mime),
      width: pick.width, height: pick.height, size: pick.blob.size, quality: pick.quality,
      reused: false, hasAlpha: Boolean(hasAlpha), orientationCorrected,
      original, attempts: summaryAttempts, note: smallImageNote(pick.width, pick.height, profile),
    };
    return { ...result, summary: summarize(result) };
  } finally {
    releaseCanvas(canvas);
    decoded.release();
  }
}
