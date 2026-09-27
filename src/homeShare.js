/* ============================================================
   Homepage Share button. Phones and tablets open the native share
   sheet; desktops and laptops copy straight to the clipboard, so
   Windows never opens its share panel (Outlook, OneNote, ...).
   The text itself always comes from shareTextFor (crowdStats.js),
   the same text the Results page copies.
   ============================================================ */

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

// Shares or copies `text` and resolves to what happened:
//   "shared"    the native share sheet completed
//   "cancelled" the user closed the share sheet (nothing is copied)
//   "copied"    the text is on the clipboard (desktop, or the share sheet is
//               missing or failed for a reason other than cancelling)
//   "failed"    the clipboard write failed
export async function shareOrCopy(text, nav) {
  if (isPhoneOrTablet(nav) && typeof nav.share === "function") {
    try {
      await nav.share({ text });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await nav.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
