/* ============================================================
   Sharing a finished result. Phones and tablets open the native
   share sheet; desktops and laptops copy straight to the clipboard,
   so Windows never opens its share panel (Outlook, OneNote, ...).
   The texts always come from shareTextsFor (crowdStats.js), the
   same formatter the Results page copies from. The share sheet gets
   no title, so apps don't repeat the header.

   When the puzzle has Home & Share artwork, the share sheet gets that
   poster as an image file plus the short image text (the poster shows
   the header and categories). Anything that stops the poster going
   (no artwork, the download fails, the device can't share that file,
   the file share errors) falls back to the full text alone.
   ============================================================ */

import { usableMediaUrl } from "./mediaPreloader.js";

// True on phones and tablets. The user agent is enough: iPhone, iPod and
// Android (phones and tablets) name themselves, Chromium also reports
// userAgentData.mobile, and iPadOS Safari, which claims to be a Mac, is the
// only "Mac" with touch points. Touchscreen Windows laptops count as desktop.
export function isPhoneOrTablet(nav) {
  if (!nav) return false;
  if (nav.userAgentData?.mobile === true) return true;
  const ua = String(nav.userAgent || "");
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return /Macintosh/.test(ua) && nav.maxTouchPoints > 1;
}

// True where sharing opens the native share sheet rather than copying.
const usesShareSheet = (nav) => isPhoneOrTablet(nav) && typeof nav.share === "function";

// Shares or copies one finished result and resolves to what happened:
//   "shared"    the native share sheet completed
//   "cancelled" the user closed the share sheet (nothing else is tried)
//   "copied"    the full text is on the clipboard (desktop, or the share
//               sheet is missing or failed for a reason other than cancelling)
//   "failed"    the clipboard write failed
// `text` is the full share text; `imageText` goes with the poster at
// `imageUrl` (both optional: without them only the full text is shared).
// On phones the poster goes first, then the full text alone, then the
// clipboard; a cancel at either sheet ends it there.
export async function shareResult({ text, imageText, imageUrl }, nav, { fetchImpl } = {}) {
  if (usesShareSheet(nav)) {
    const file = imageUrl && imageText ? await shareImageFile(imageUrl, nav, fetchImpl) : null;
    if (file) {
      try {
        await nav.share({ files: [file], text: imageText });
        return "shared";
      } catch (err) {
        if (err?.name === "AbortError") return "cancelled";
      }
    }
    try {
      await nav.share({ text });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  return copyText(text, nav);
}

// The text-only share: shareResult without a poster.
export function shareOrCopy(text, nav) {
  return shareResult({ text }, nav);
}

// What Share shows for shareResult's outcome: "copied" (only after a real
// clipboard write) and "failed" have feedback; a completed or cancelled
// share sheet shows nothing.
export function shareFeedback(outcome) {
  return outcome === "copied" || outcome === "failed" ? outcome : null;
}

// Puts `text` on the clipboard exactly as given: Home's desktop copy and
// fallback, and Results' copy button. Resolves to "copied" or "failed".
export async function copyText(text, nav) {
  try {
    await nav.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/* ---------- the poster as a shareable file ---------- */

// Image types a share sheet may take, by the extension the file is named
// with. Uploads are stored as WebP (or JPEG/PNG); older puzzles may link
// other formats, and canShare decides whether this device takes them.
const IMAGE_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const MIME_BY_EXTENSION = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };

// The poster's type: the response's own image type, else (for servers that
// send none or a generic one) the URL's extension. Null for anything else.
export function shareImageType(blobType, url) {
  const type = String(blobType || "").split(";")[0].trim().toLowerCase();
  if (IMAGE_EXTENSIONS[type]) return type;
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(String(url || ""))?.[1]?.toLowerCase();
  return MIME_BY_EXTENSION[ext] || null;
}

// Downloads in flight or done, by URL, so the poster is fetched once and
// is usually ready before Share is pressed (see prepareShareImage).
const imageFiles = new Map();

// The poster as a File named what-the-fudge-trivia.<ext>, or null when it
// can't be downloaded or isn't an image. Never rejects.
async function loadImageFile(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const type = shareImageType(blob.type, url);
    if (!type || !blob.size) return null;
    return new File([blob], `what-the-fudge-trivia.${IMAGE_EXTENSIONS[type]}`, { type });
  } catch {
    return null;
  }
}

// Starts downloading the poster where it could be shared (a phone or tablet
// whose share sheet takes files), so pressing Share doesn't wait on the
// network: share sheets must open straight from the tap. A failed download
// is forgotten, so the next attempt tries again.
export function prepareShareImage(url, nav, fetchImpl) {
  if (!url || !usesShareSheet(nav) || typeof nav.canShare !== "function") return null;
  if (!imageFiles.has(url)) {
    const fetcher = fetchImpl || globalThis.fetch?.bind(globalThis);
    if (!fetcher) return null;
    const pending = loadImageFile(url, fetcher).then((file) => {
      if (!file) imageFiles.delete(url);
      return file;
    });
    imageFiles.set(url, pending);
  }
  return imageFiles.get(url);
}

// The poster file, if this device's share sheet accepts it; otherwise null.
async function shareImageFile(url, nav, fetchImpl) {
  const file = await prepareShareImage(url, nav, fetchImpl);
  if (!file) return null;
  try {
    return nav.canShare({ files: [file] }) ? file : null;
  } catch {
    return null;
  }
}

// Test hook: forget every downloaded poster.
export function clearShareImages() {
  imageFiles.clear();
}

// The puzzle's Home & Share poster: its stored artwork URL (the field is
// still called headerImage), or null when it has none or it isn't usable.
export function puzzleArtworkUrl(game) {
  return usableMediaUrl(game?.headerImage);
}
