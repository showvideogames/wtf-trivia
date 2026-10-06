// The guest handoff: how a WTF guest's progress follows them into an account.
//
// A WTF guest is an anonymous Supabase Auth user with real rows (plays,
// streak counters, favorites) keyed by its own id. Leaving for the shared
// sign-in replaces that session with the account's, so just before leaving
// the guest asks the server for a one-time code (offer_guest_history) that
// proves it owned those rows. The code sits in this tab's sessionStorage;
// after the sign-in the account presents it:
//
//   "Add my progress"  import_guest_history(code)   the guest's rows change owner
//                                                   in place; counters are rebuilt
//   "Start fresh"      decline_guest_history(code)  nothing moves; the code is spent
//
// Either way the decision is final: the server deletes the code, and the
// guest session is gone from this browser. No device record, no flag: the
// spent code IS the record. If the sign-in never completes, the guest
// session is untouched and the code simply expires (one hour).

import { supabase } from "./supabaseClient.js";

export const HANDOFF_KEY = "wtf-guest-handoff";

const read = () => {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.code === "string" && v.code.length >= 16 ? v : null;
  } catch {
    return null;
  }
};
const write = (v) => {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(v));
  } catch {
    // storage blocked: the prompt will simply not appear; the guest rows stay as they are
  }
};

/** The pending handoff { code, summary } for this tab, or null. */
export function readPendingHandoff() {
  return read();
}

export function clearPendingHandoff() {
  try {
    sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    // ignore
  }
}

const row = (res) => (Array.isArray(res.data) ? res.data[0] : res.data) ?? null;

/**
 * Called as the GUEST, right before the redirect. Stores the code for this tab.
 * Returns the server outcome: ok | no_history | not_a_guest | not_signed_in | unavailable.
 * Never throws: a failure here must not stop the sign-in.
 */
export async function offerGuestHandoff() {
  if (!supabase) return "unavailable";
  try {
    const res = await supabase.rpc("offer_guest_history");
    const r = row(res);
    if (res.error || !r) return "unavailable";
    if (r.outcome === "ok" && r.code) {
      write({
        code: r.code,
        offeredAt: Date.now(),
        summary: { plays: r.plays, finished: r.finished, currentStreak: r.current_streak, longestStreak: r.longest_streak, favorites: r.favorites },
      });
    }
    return r.outcome;
  } catch {
    return "unavailable";
  }
}

/**
 * Called as the ACCOUNT. Checks the pending code with the server and returns
 * what the prompt should say, or null when there is nothing to ask (no code,
 * or the code is spent/expired/invalid, in which case it is also forgotten).
 */
export async function resolvePendingHandoff() {
  const pending = read();
  if (!pending) return null;
  if (!supabase) return null;
  const res = await supabase.rpc("resolve_guest_handoff", { _code: pending.code });
  const r = row(res);
  if (res.error) return null; // server unreachable: ask again on the next load
  if (!r || r.outcome !== "ok") {
    clearPendingHandoff();
    return null;
  }
  return {
    plays: r.plays,
    finished: r.finished,
    currentStreak: r.current_streak,
    longestStreak: r.longest_streak,
    favorites: r.favorites,
    accountHasHistory: r.account_has_history === true,
  };
}

/** "Add my progress". Resolves { ok, outcome, moved?, dropped?, favorites?, message? }. */
export async function importPendingHandoff() {
  const pending = read();
  if (!pending || !supabase) return { ok: false, outcome: "invalid", message: "Nothing to add." };
  const res = await supabase.rpc("import_guest_history", { _code: pending.code });
  if (res.error) return { ok: false, outcome: "unavailable", message: res.error.message };
  const r = row(res);
  clearPendingHandoff();
  if (r?.outcome !== "imported") return { ok: false, outcome: r?.outcome ?? "invalid", message: "Your guest progress could not be added." };
  return { ok: true, outcome: "imported", moved: r.plays_moved, dropped: r.plays_dropped, favorites: r.favorites_moved };
}

/** "Start fresh". Never throws; the code is forgotten locally whatever the server says. */
export async function declinePendingHandoff() {
  const pending = read();
  clearPendingHandoff();
  if (!pending || !supabase) return "invalid";
  try {
    const res = await supabase.rpc("decline_guest_history", { _code: pending.code });
    return row(res)?.outcome ?? (res.error ? "unavailable" : "invalid");
  } catch {
    return "unavailable";
  }
}
