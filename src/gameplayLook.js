// ---- GAMEPLAY LOOK ----
// The question and reveal screens use the paper look (PaperPrompt, the
// quieter matchup, cards and reveal in paperLook.css). For design review
// only, and not linked anywhere, the previous look can still be shown in one
// browser tab:
//   ?look=classic  the previous gameplay styling, for the rest of this tab
//   ?look=paper    back to the paper look
// Only the question and reveal screens read it.
//
// In development builds only, ?paper=short, medium or parchment puts every
// question on that one sheet, and ?paper=auto goes back to the normal choice
// (paperAssets.js). Production always uses the normal choice.

export const LOOK_KEY = "wtf-gameplay-look";
export const PAPER_KEY = "wtf-gameplay-paper";
const PAPER_CHOICES = ["short", "medium", "parchment"];

export function readPaperLook(search, storage) {
  let asked = null;
  try { asked = new URLSearchParams(search || "").get("look"); } catch { /* no URL */ }
  try {
    if (asked === "classic") storage?.setItem(LOOK_KEY, "classic");
    else if (asked === "paper") storage?.removeItem(LOOK_KEY);
    return storage?.getItem(LOOK_KEY) !== "classic";
  } catch {
    return asked !== "classic";
  }
}

// The sheet every prompt is forced onto, or null for the normal choice.
export function readPaperAsset(search, storage) {
  let asked = null;
  try { asked = new URLSearchParams(search || "").get("paper"); } catch { /* no URL */ }
  try {
    if (PAPER_CHOICES.includes(asked)) storage?.setItem(PAPER_KEY, asked);
    else if (asked === "auto") storage?.removeItem(PAPER_KEY);
    const saved = storage?.getItem(PAPER_KEY);
    return PAPER_CHOICES.includes(saved) ? saved : null;
  } catch {
    return PAPER_CHOICES.includes(asked) ? asked : null;
  }
}

function tabStorage() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

const inBrowser = typeof window !== "undefined";
export const PAPER_LOOK = !inBrowser || readPaperLook(window.location.search, tabStorage());
export const PAPER_ASSET = import.meta.env.DEV && inBrowser ? readPaperAsset(window.location.search, tabStorage()) : null;
