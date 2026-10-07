/* ============================================================
   Best-effort image archiving for Admin saves.

   Copying a puzzle's images into permanent storage is separate from saving
   the puzzle: every image is tried on its own, a failure keeps that image's
   existing value and is reported as a warning, and the puzzle is saved
   either way. Pure logic; the actual fetch/upload is passed in, so every
   case can be tested without a network.
   ============================================================ */

// How many images are copied at once. Enough to keep publishing quick,
// few enough not to swamp a phone connection or the image hosts.
export const ARCHIVE_CONCURRENCY = 4;

/**
 * Every image a puzzle references: the square poster (header), the wide
 * artwork, category A, category B, then each question. Blank, missing and
 * non-string values are skipped (a question without an image is not an
 * image to archive).
 */
export function listPuzzleImages(game) {
  const out = [];
  const add = (target) => {
    if (typeof target.url === "string" && target.url.trim()) out.push(target);
  };
  add({ key: "headerImage", kind: "header", field: "headerImage", url: game?.headerImage });
  add({ key: "wideImage", kind: "wide", field: "wideImage", url: game?.wideImage });
  add({ key: "categoryAImage", kind: "category", field: "categoryAImage", slot: "A", url: game?.categoryAImage });
  add({ key: "categoryBImage", kind: "category", field: "categoryBImage", slot: "B", url: game?.categoryBImage });
  (Array.isArray(game?.questions) ? game.questions : []).forEach((q, index) => {
    add({ key: `question:${q?.id ?? `#${index}`}`, kind: "question", field: "imageUrl", questionId: q?.id, questionIndex: index, itemText: q?.itemText, url: q?.imageUrl });
  });
  return out;
}

// Runs fn over items with at most `limit` in flight; never rejects.
async function settleAll(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await fn(items[i]) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Archive every image independently.
 *
 * @param game - the puzzle about to be saved
 * @param archive - async (url, target) => newUrl; returns the url unchanged
 *   when nothing needs doing, throws when a copy fails
 * @param isExternal - (url) => whether a successful copy replaced a pasted
 *   external link, in which case a question keeps it as `originalImageUrl`
 * @returns {game, failures, copied} -- game with every successful new URL
 *   applied and every failed one left exactly as it was
 */
export async function archivePuzzleImages(game, { archive, isExternal = () => false, concurrency = ARCHIVE_CONCURRENCY }) {
  const targets = listPuzzleImages(game);
  const results = await settleAll(targets, concurrency, (t) => archive(t.url, t));
  const updated = { ...game, questions: Array.isArray(game?.questions) ? game.questions.map((q) => q) : game?.questions };
  const failures = [];
  let copied = 0;
  targets.forEach((t, i) => {
    const r = results[i];
    if (!r.ok) {
      failures.push({ ...t, code: r.error?.code || "unknown", status: r.error?.status ?? null, reason: r.error?.reason || r.error?.message || "" });
      return; // keep the existing value untouched
    }
    const next = r.value;
    if (typeof next !== "string" || !next || next === t.url) return;
    copied++;
    if (t.kind === "question") {
      const q = updated.questions[t.questionIndex];
      updated.questions[t.questionIndex] = isExternal(t.url)
        ? { ...q, imageUrl: next, originalImageUrl: q.originalImageUrl || t.url }
        : { ...q, imageUrl: next };
    } else {
      updated[t.field] = next;
    }
  });
  return { game: updated, failures, copied };
}

/** The value a failed image's field holds now, to tell whether it was replaced. */
export function currentImageUrl(game, failure) {
  if (failure.kind !== "question") return game?.[failure.field];
  const qs = Array.isArray(game?.questions) ? game.questions : [];
  const q = failure.questionId != null ? qs.find((x) => x?.id === failure.questionId) : qs[failure.questionIndex];
  return q ? q.imageUrl : undefined;
}

/** A warning stays open until its field no longer holds the URL that failed. */
export function isWarningResolved(game, failure) {
  return currentImageUrl(game, failure) !== failure.url;
}

/** What to call a failed image in a sentence. */
export function imageName(failure, game) {
  if (failure.kind === "header") return "The square poster";
  if (failure.kind === "wide") return "The wide artwork";
  if (failure.kind === "category") {
    const cat = failure.slot === "A" ? game?.categoryA : game?.categoryB;
    return `The Category ${failure.slot} image${cat ? ` (${cat})` : ""}`;
  }
  const text = (failure.itemText || "").trim();
  return `“${text || `Question ${failure.questionIndex + 1}`}”`;
}

export function isBrokenLink(failure) {
  return failure.code === "http" && (failure.status === 404 || failure.status === 410);
}

/** Why a copy failed, in plain words. */
export function failureReason(failure) {
  switch (failure.code) {
    case "blocked": return "The website hosting it doesn't allow copying, or couldn't be reached.";
    case "timeout": return "The website hosting it took too long to respond.";
    case "http": return isBrokenLink(failure) ? `The link is broken (the website returned ${failure.status}).` : `The website hosting it returned an error (${failure.status}).`;
    case "not-image": return "The link doesn't point to an image.";
    case "optimize": return failure.reason || "The image couldn't be processed.";
    case "upload-auth": return "Storage refused the copy because this browser isn't signed in to an admin account. Sign in with your admin account, then publish again.";
    case "upload-network": return "Image storage couldn't be reached. Check your connection, then publish again.";
    case "upload": return "Saving the copy to storage failed. Publishing again may work.";
    default: return failure.reason || "Unknown error.";
  }
}

const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * Headline and body for the persistent warning shown after a save that
 * succeeded with image failures. `action` is "Published" or "Saved".
 */
export function describeImageWarning(failures, game, action = "Published") {
  const n = failures.length;
  const title = `${action} with ${n} image ${plural(n, "warning", "warnings")}`;
  if (n === 1) {
    const f = failures[0];
    const name = imageName(f, game);
    const body = isBrokenLink(f)
      ? `${name} couldn't be copied into permanent storage because its link is broken. The link was kept, but players will see “Image unavailable” until you upload a replacement.`
      : `${name} couldn't be copied into permanent storage. Its existing image was kept, but you may want to upload a replacement.`;
    return { title, body };
  }
  return {
    title,
    body: "These images couldn't be copied into permanent storage. Their existing images were kept, but you may want to upload replacements.",
  };
}
