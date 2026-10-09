/* ============================================================
   Sharing a finished result. Phones and tablets open the native
   share sheet; desktops and laptops copy straight to the clipboard,
   so Windows never opens its share panel (Outlook, OneNote, ...).
   The text always comes from buildResultsShareText (share.js), the
   same formatter the Results page copies from, and ends with the
   puzzle's own link. The share sheet gets that text only: no title
   (so apps don't repeat it) and no image file. Apps that preview
   links fetch the puzzle's artwork from the link themselves
   (api/puzzle.js); whether they show it is up to each app.
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

// Shares or copies one finished result's text and resolves to what happened:
//   "shared"    the native share sheet completed
//   "cancelled" the user closed the share sheet (nothing else is tried)
//   "copied"    the text is on the clipboard (desktop, or the share sheet is
//               missing or failed for a reason other than cancelling)
//   "failed"    the clipboard write failed
//
// With a `url` (the result link, shareLink.js) the link is the whole payload:
// no text goes with it, so messaging apps show the rich result card alone
// instead of the score as plain text above it. Without one, `text` is shared.
export async function shareResult({ text, url }, nav) {
  const payload = url ? { url } : { text };
  if (usesShareSheet(nav)) {
    try {
      await nav.share(payload);
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  return copyText(url || text, nav);
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

// The puzzle's square poster (Home's centrepiece): its stored URL (the field
// is still called headerImage), or null when it has none or it isn't usable.
export function puzzleArtworkUrl(game) {
  return usableMediaUrl(game?.headerImage);
}

// The puzzle's wide artwork (~1200x630), or null when it has none or it
// isn't usable.
export function wideArtworkUrl(game) {
  return usableMediaUrl(game?.wideImage);
}
