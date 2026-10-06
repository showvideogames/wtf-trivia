// ============================================================
// ADMIN ACCESS — who may write, and why an upload failed
// ============================================================
// Since the admin gate (supabase/migrations/0003_wtf_admin_gate.sql), saving
// a puzzle and uploading an image need a signed-in ADMIN ACCOUNT; the Studio
// password alone opens nothing on the server. These are the pure pieces:
// the Studio's access state and its copy, and the classification of a
// failed storage upload, so a refused upload is never reported as a
// connection problem. App.jsx and ImageField.jsx do the fetching and
// rendering.

// ---- Studio access -------------------------------------------------------
// checking     the account is being confirmed (boot, or the account changed)
// admin        a signed-in admin account: saving and uploads are allowed
// guest        this browser is an anonymous guest (or has no session)
// not_admin    a signed-in account that is not an admin
// unavailable  the check itself failed (network, or the server didn't answer)
export const ADMIN_STATUSES = ["checking", "admin", "guest", "not_admin", "unavailable"];

export function canWriteAs(status) {
  return status === "admin";
}

/**
 * What the Studio says when it can't write. `action` is the one thing to
 * offer: "signin" | "signout" | "retry" | null (still checking).
 */
export function describeAdminAccess(status, email = null) {
  switch (status) {
    case "admin":
      return { canWrite: true, title: "", body: "", action: null };
    case "checking":
      return {
        canWrite: false,
        title: "Checking your admin account…",
        body: "Saving, publishing and uploads are paused until it's confirmed.",
        action: null,
      };
    case "guest":
      return {
        canWrite: false,
        title: "Sign in with your admin account",
        body: "This browser is signed in as a guest. Puzzle Studio saves, publishes and uploads images only for a signed-in admin account.",
        action: "signin",
      };
    case "not_admin":
      return {
        canWrite: false,
        title: "This account isn't an admin",
        body: `${email ? `You're signed in as ${email}, which` : "The signed-in account"} can't save, publish or upload images. Sign out, then sign in with your admin account.`,
        action: "signout",
      };
    default:
      return {
        canWrite: false,
        title: "Couldn't confirm your admin account",
        body: "The check didn't reach the server. Check your connection, then try again.",
        action: "retry",
      };
  }
}

// ---- Upload failures -----------------------------------------------------
// signed-out  no account session (a guest, none at all, or an expired token)
// permission  the server refused this account (row-level security)
// network     the request never got an answer
// server      any other answer from storage
export class StorageUploadError extends Error {
  constructor(code, { status = null, detail = "" } = {}) {
    super(`Image upload failed (${code}${status ? ` ${status}` : ""})${detail ? `: ${detail}` : ""}`);
    this.name = "StorageUploadError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const isAccessProblem = (code) => code === "signed-out" || code === "permission";

/**
 * Classify a non-OK storage response. Supabase Storage often answers a
 * refused write with HTTP 400 and the real status inside the body
 * ({"statusCode":"403","error":"Unauthorized","message":"new row violates
 * row-level security policy"}), so the body decides, not just the status.
 */
export function classifyStorageFailure(httpStatus, bodyText = "") {
  let body = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = null;
  }
  const inner = Number(body?.statusCode) || null;
  const status = inner || httpStatus || null;
  const text = `${body?.error ?? ""} ${body?.message ?? ""} ${body ? "" : bodyText}`.toLowerCase();
  const detail = String(body?.message || bodyText || "").slice(0, 200);
  if (/jwt|exp. claim|invalid compact jws|token (is )?expired|invalid token/.test(text) || status === 401) {
    return new StorageUploadError("signed-out", { status, detail });
  }
  if (status === 403 || /row-level security|permission denied|unauthorized/.test(text)) {
    return new StorageUploadError("permission", { status, detail });
  }
  return new StorageUploadError("server", { status, detail });
}

/** What the image field says after a failed upload. */
export function uploadFailureMessage(error, hadImage) {
  const kept = hadImage ? "your current image is unchanged" : "nothing was saved";
  switch (error?.code) {
    case "signed-out":
      return `Upload failed because this browser isn't signed in to an admin account, so ${kept}. Sign in with your admin account, then try again.`;
    case "permission":
      return `Upload failed because this account isn't allowed to upload images (admins only), so ${kept}. Sign in with your admin account, then try again.`;
    case "server":
      return `Upload failed because image storage returned an error${error.status ? ` (${error.status})` : ""}, so ${kept}. Try again in a moment.`;
    default:
      return `Upload failed because image storage couldn't be reached, so ${kept}. Check your connection and try again.`;
  }
}

/** The publish-time copy failure code for a storage upload error (see failureReason). */
export function copyFailureCode(error) {
  if (isAccessProblem(error?.code)) return "upload-auth";
  if (error?.code === "network") return "upload-network";
  return "upload";
}
