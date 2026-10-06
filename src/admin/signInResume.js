// ============================================================
// SIGN-IN FROM THE EDITOR — keep the edits across the round trip
// ============================================================
// Signing in leaves the page. Before it does, the editor's unsaved edits
// go into the on-device draft copy and the puzzle to reopen goes into this
// tab's session storage; the root reopens it on the way back and
// loadEditorDraft restores the edits. Both writes are read back. If either
// can't be stored (storage full, blocked, private mode), the sign-in does
// not start: the admin stays in the editor with everything intact.

export const ADMIN_RESUME_KEY = "wtf-admin-resume";

export const EDITS_NOT_STORED = "Couldn't keep your unsaved edits on this device, so sign-in didn't start (it would leave this page and lose them). Your edits are still here. Export the text to keep a copy, or free up browser storage and try again.";
export const RESUME_NOT_STORED = "Couldn't remember this puzzle for after sign-in, so sign-in didn't start. Your edits are still here. Free up browser storage and try again.";

const sessionStore = () => (typeof sessionStorage === "undefined" ? null : sessionStorage);

/** Store the puzzle to reopen after sign-in. True only if it reads back intact. */
export function writeAdminResume(game, storage = sessionStore()) {
  if (!game?.id || !storage) return false;
  try {
    const raw = JSON.stringify(game);
    storage.setItem(ADMIN_RESUME_KEY, raw);
    return storage.getItem(ADMIN_RESUME_KEY) === raw;
  } catch {
    return false;
  }
}

export function clearAdminResume(storage = sessionStore()) {
  try {
    storage?.removeItem(ADMIN_RESUME_KEY);
  } catch {
    // storage blocked: nothing was stored
  }
}

/** Read the puzzle to reopen, once. */
export function takeAdminResume(storage = sessionStore()) {
  try {
    const raw = storage?.getItem(ADMIN_RESUME_KEY);
    storage?.removeItem(ADMIN_RESUME_KEY);
    const game = raw ? JSON.parse(raw) : null;
    return game && typeof game.id === "string" ? game : null;
  } catch {
    return null;
  }
}

/**
 * Everything that must be stored before leaving for sign-in.
 * hasEdits:   there are edits only this editor holds
 * saveDraft:  () => true once the edits are verifiably on the device
 * saveResume: () => true once the puzzle to reopen is verifiably stored
 * Returns {ok:true} or {ok:false, message}; on failure nothing to reopen is
 * left behind, so a later visit never opens a half-stored puzzle.
 */
export function prepareSignInFromEditor({ hasEdits, saveDraft, saveResume, clearResume = clearAdminResume }) {
  let draftOk = false;
  try {
    draftOk = !hasEdits || saveDraft() === true;
  } catch {
    draftOk = false;
  }
  if (!draftOk) return { ok: false, message: EDITS_NOT_STORED };
  let resumeOk = false;
  try {
    resumeOk = saveResume() === true;
  } catch {
    resumeOk = false;
  }
  if (!resumeOk) {
    clearResume();
    return { ok: false, message: RESUME_NOT_STORED };
  }
  return { ok: true };
}
