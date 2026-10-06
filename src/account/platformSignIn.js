// Signing in to WTF Trivia with the shared account.
//
// WTF has ONE sign-in method: the shared identity provider (WorkOS AuthKit),
// wired into this project's Supabase Auth as the custom OIDC provider
// `custom:platform`. The old email/password and magic-link screens are gone.
// Ported from Cluevoyance (src/account/platformSignIn.js) and Rainbow
// (src/lib/platformSignIn.ts), plus WTF's one addition: the guest handoff
// (guestHandoff.js), because WTF guests already own rows on the server.
//
//   signInWithPlatform   leave for the hosted sign-in page (after checking it
//                        is reachable, so an outage never strands the player
//                        on a browser error page). A guest with history first
//                        mints its handoff code.
//   handleCallback       runs ONLY on /auth/callback: swaps the one-time code
//                        for a LOCAL session and strips the code from the
//                        address bar
//   ensureAccount        asks the server to create/refresh the account behind
//                        this session (ensure_account RPC). An auth user that
//                        did not come through the shared sign-in is NOT a WTF
//                        account and is signed out again locally
//   signOutOfWtf         local sign-out: this game, this browser. The shared
//                        session and other games are untouched. The app then
//                        signs in anonymously again: a brand-new guest
//   deleteMyAccount      self-service deletion of the local account
//
// Nothing here names a provider brand, a project or a domain: the discovery
// URL and the feature switch are configuration (src/game/config.js).

import { ACCOUNTS_ENABLED, PLATFORM_DISCOVERY_URL } from "../game/config.js";
import { AUTH_STORAGE_KEY, supabase } from "./supabaseClient.js";
import { rememberReturnPath, takeReturnPath } from "./safePath.js";
import { clearPendingHandoff, offerGuestHandoff } from "./guestHandoff.js";

export const PLATFORM_PROVIDER = "custom:platform";
export const HUB_UNAVAILABLE = "Sign-in is temporarily unavailable. You can keep playing and try again later.";
export const NOT_WTF_ACCOUNT = "That sign-in is not a WTF Trivia account.";

export function callbackUrl() {
  return `${window.location.origin}/auth/callback`;
}

/** Plain reachability test of the identity provider: no credentials, nothing read. */
export async function hubIsReachable(timeoutMs = 8000) {
  if (!PLATFORM_DISCOVERY_URL) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(PLATFORM_DISCOVERY_URL, { mode: "no-cors", credentials: "omit", cache: "no-store", signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Leave for the shared sign-in page. Returns an error message, or null when
 * the redirect is under way. `isGuest` says whether the current session is an
 * anonymous guest (then its history is offered for the handoff first).
 */
export async function signInWithPlatform({ isGuest = true } = {}) {
  if (!ACCOUNTS_ENABLED || !supabase) return HUB_UNAVAILABLE;
  if (!(await hubIsReachable())) return HUB_UNAVAILABLE;
  if (isGuest) await offerGuestHandoff(); // best effort; never blocks the sign-in
  rememberReturnPath();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: PLATFORM_PROVIDER,
    options: { redirectTo: callbackUrl(), scopes: "openid email profile" },
  });
  return error ? error.message : null;
}

/**
 * Runs ONLY on /auth/callback. Exchanges the one-time code for a local
 * session. The code and any error text are removed from the address bar
 * (and history) immediately, whatever happens next. Guest rows are never
 * touched here: a failed callback leaves the browser exactly as it was.
 */
export async function handleCallback() {
  const returnTo = takeReturnPath();
  const url = new URL(window.location.href);
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const pick = (k) => url.searchParams.get(k) ?? fromHash.get(k);

  const code = pick("code");
  const errorCode = pick("error_code") ?? pick("error");
  const errorMessage = pick("error_description");

  window.history.replaceState(null, "", "/auth/callback");

  if (errorCode) return { ok: false, errorCode, errorMessage: errorMessage ?? errorCode, returnTo };
  if (!code) return { ok: false, errorCode: "missing_code", errorMessage: "No sign-in code was returned.", returnTo };
  if (!supabase) return { ok: false, errorCode: "not_configured", errorMessage: HUB_UNAVAILABLE, returnTo };

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return { ok: false, errorCode: error.code ?? "exchange_failed", errorMessage: error.message, returnTo };
  }
  forgetHubTokens();
  return { ok: true, returnTo };
}

/**
 * After a sign-in Supabase hands the page the identity provider's own access
 * token and keeps it in browser storage. WTF has no use for it. Remove it at
 * once; the local session is untouched.
 */
export function forgetHubTokens() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored && (stored.provider_token || stored.provider_refresh_token)) {
      delete stored.provider_token;
      delete stored.provider_refresh_token;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch {
    // storage unavailable: nothing was kept, so nothing to remove
  }
}

const toAccount = (row) => ({
  user_id: row.user_id,
  global_user_id: row.global_user_id,
  email: row.email ?? null,
  created_at: row.created_at,
});

/**
 * The server's answer to "is this session a WTF account?", creating the
 * account on first sight. Reasons: ok | not_signed_in | not_platform_linked |
 * unavailable. On `unavailable` the session is KEPT so the player can try
 * again (the sign-in itself succeeded). Never call this for an anonymous
 * guest session: it would say not_platform_linked and sign the guest out.
 */
export async function ensureAccount() {
  if (!supabase) return { ok: false, account: null, reason: "unavailable", message: HUB_UNAVAILABLE };
  const { data, error } = await supabase.rpc("ensure_account");
  if (error) return { ok: false, account: null, reason: "unavailable", message: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  switch (row?.outcome) {
    case "ok": {
      if (!row.user_id) break;
      return { ok: true, account: toAccount(row), reason: "ok", message: "" };
    }
    case "not_platform_linked":
      await supabase.auth.signOut({ scope: "local" });
      return { ok: false, account: null, reason: "not_platform_linked", message: NOT_WTF_ACCOUNT };
    case "not_signed_in":
      return { ok: false, account: null, reason: "not_signed_in", message: "Not signed in." };
  }
  return { ok: false, account: null, reason: "unavailable", message: "No account row was returned." };
}

/**
 * The server's answer to "may this session write official content?":
 * "admin" | "not_admin" | "unavailable" (the question didn't get an answer,
 * which is not the same as "no"). The database enforces it regardless.
 */
export async function checkAdminStatus() {
  if (!supabase) return "unavailable";
  try {
    const { data, error } = await supabase.rpc("is_wtf_admin");
    if (error) return "unavailable";
    return data === true ? "admin" : "not_admin";
  } catch {
    return "unavailable";
  }
}

/** Whether the signed-in account may write official content (the database enforces it regardless). */
export async function checkIsAdmin() {
  return (await checkAdminStatus()) === "admin";
}

/**
 * LOCAL sign-out: this game, this browser. The shared session at the
 * provider is untouched (other games stay signed in). Any pending handoff is
 * forgotten. The caller then signs in anonymously again, so this browser
 * starts over as a brand-new guest and never shows one person's games to
 * the next.
 */
export async function signOutOfWtf() {
  clearPendingHandoff();
  if (!supabase) return;
  await supabase.auth.signOut({ scope: "local" });
}

/**
 * Delete the signed-in account and its plays. The shared identity survives;
 * signing in again creates a fresh, empty account with the same global id.
 */
export async function deleteMyAccount() {
  if (!supabase) return { ok: false, message: HUB_UNAVAILABLE };
  const { data, error } = await supabase.rpc("delete_my_account");
  if (error) return { ok: false, message: error.message };
  if (data !== true) return { ok: false, message: "This session is not a WTF Trivia account." };
  // The auth user is gone server-side; drop the stored session first so
  // signOut finds nothing to revoke and makes no request with a dead token.
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
  await signOutOfWtf();
  return { ok: true };
}
