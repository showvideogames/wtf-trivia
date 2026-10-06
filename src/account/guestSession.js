// One guest session per browser, however many tabs are open.
//
// A WTF guest is an anonymous Supabase Auth user. Every tab of the game shares
// the same stored session (localStorage), so when one tab signs out, every
// other tab learns about it at the same instant and each would mint its own
// anonymous user. The last one to write storage wins; the others then write
// their player rows under a token that is no longer the stored session, the
// request fails (RLS 403) and the tab shows the boot error page.
//
// ensureGuestSession serialises guest creation across tabs with the Web Locks
// API (a browser-wide mutex shared by every tab of the origin). Inside the
// lock each tab first re-reads the stored session: if another tab already
// created the guest, it is reused; only the first tab actually signs in.
// Within one tab, concurrent callers share a single in-flight promise. When
// Web Locks are unavailable (very old browsers, some tests) it degrades to the
// in-tab promise only, which is exactly the behaviour before this module.

export const GUEST_SIGN_IN_LOCK = "wtf-guest-sign-in";

/**
 * @param {object} deps
 * @param {() => Promise<object|null>} deps.getSession   the current stored session (null when none)
 * @param {() => Promise<object>} deps.signInAnonymously  creates the guest; resolves to the new session
 * @param {object} [deps.locks]                            navigator.locks (or a stand-in); optional
 * @param {string} [deps.lockName]
 */
export function createGuestSessionGuard({ getSession, signInAnonymously, locks = globalThis.navigator?.locks, lockName = GUEST_SIGN_IN_LOCK }) {
  let inFlight = null;

  const createUnderLock = async () => {
    // Another tab may have created the guest while this one waited for the lock.
    const again = await getSession().catch(() => null);
    if (again?.user) return { session: again, created: false };
    const session = await signInAnonymously();
    return { session, created: true };
  };

  const acquire = () => {
    if (locks && typeof locks.request === "function") {
      return locks.request(lockName, createUnderLock);
    }
    return createUnderLock();
  };

  /** Resolves to { session, created }. `created` is true only in the tab that actually signed in. */
  return async function ensureGuestSession() {
    const existing = await getSession().catch(() => null);
    if (existing?.user) return { session: existing, created: false };
    inFlight ??= acquire().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
