// Regression check for the multi-tab sign-out race: when one tab signs out,
// every open tab of the browser must end up on ONE shared guest session, with
// exactly one anonymous sign-in, and every tab's player write must happen
// under that session's user. Run: npm run test:unit
import { describe, expect, it } from "vitest";
import { createGuestSessionGuard } from "./guestSession.js";

// ── a stand-in for a browser: shared storage + a Web Locks mutex ──
function makeBrowser() {
  const storage = { session: null };
  let created = 0;
  // navigator.locks stand-in: one holder at a time per name, FIFO
  const queues = new Map();
  const locks = {
    request(name, cb) {
      const prev = queues.get(name) ?? Promise.resolve();
      const next = prev.then(() => cb()).finally(() => {
        if (queues.get(name) === next) queues.delete(name);
      });
      queues.set(name, next.catch(() => {}));
      return next;
    },
  };
  // a tab = a supabase-like client reading the SHARED storage, as supabase-js does on getSession()
  const tab = (name) => {
    const client = {
      name,
      getSession: async () => storage.session,
      signInAnonymously: async () => {
        await new Promise((r) => setTimeout(r, 5)); // network
        created += 1;
        const session = { access_token: `token-${created}`, user: { id: `guest-${created}`, is_anonymous: true } };
        storage.session = session; // supabase-js persists before resolving
        return session;
      },
      signOutLocal: async () => {
        storage.session = null;
      },
    };
    client.ensureGuestSession = createGuestSessionGuard({ getSession: client.getSession, signInAnonymously: client.signInAnonymously, locks });
    return client;
  };
  return { storage, locks, tab, createdCount: () => created };
}

describe("multi-tab sign-out: one guest for every tab", () => {
  it("three tabs reacting to the same sign-out share one anonymous user", async () => {
    const b = makeBrowser();
    const tabs = [b.tab("A"), b.tab("B"), b.tab("C")];
    b.storage.session = { access_token: "account", user: { id: "account-1", is_anonymous: false } };

    await tabs[0].signOutLocal(); // tab A signs out; B and C are told at the same instant
    const results = await Promise.all(tabs.map((t) => t.ensureGuestSession()));

    expect(b.createdCount()).toBe(1);
    const ids = new Set(results.map((r) => r.session.user.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(b.storage.session.user.id).toBe([...ids][0]);
  });

  it("a tab whose write runs after another tab's sign-in uses the stored session's user, not a stale one", async () => {
    const b = makeBrowser();
    const a = b.tab("A");
    const c = b.tab("C");
    await a.signOutLocal();
    const first = await a.ensureGuestSession(); // A creates guest-1
    // C captured nothing yet; when it comes to write its player row it asks for the guest and gets the same one
    const second = await c.ensureGuestSession();
    expect(second.created).toBe(false);
    expect(second.session.user.id).toBe(first.session.user.id);
    expect(b.createdCount()).toBe(1);
  });

  it("without Web Locks the in-tab guard still collapses concurrent callers in one tab", async () => {
    const b = makeBrowser();
    const t = b.tab("solo");
    // null, not undefined: undefined would fall back to the function's default (navigator.locks)
    t.ensureGuestSession = createGuestSessionGuard({ getSession: t.getSession, signInAnonymously: t.signInAnonymously, locks: null });
    await t.signOutLocal();
    const results = await Promise.all([t.ensureGuestSession(), t.ensureGuestSession(), t.ensureGuestSession()]);
    expect(b.createdCount()).toBe(1);
    expect(new Set(results.map((r) => r.session.user.id)).size).toBe(1);
  });

  it("an existing session is reused without taking the lock or signing in", async () => {
    const b = makeBrowser();
    const t = b.tab("A");
    b.storage.session = { access_token: "x", user: { id: "guest-existing", is_anonymous: true } };
    const r = await t.ensureGuestSession();
    expect(r).toEqual({ session: b.storage.session, created: false });
    expect(b.createdCount()).toBe(0);
  });

  it("a failed sign-in is not cached: the next call tries again", async () => {
    const b = makeBrowser();
    const t = b.tab("A");
    let fail = true;
    const guard = createGuestSessionGuard({
      getSession: t.getSession,
      signInAnonymously: async () => { if (fail) { fail = false; throw new Error("network"); } return t.signInAnonymously(); },
      locks: b.locks,
    });
    await expect(guard()).rejects.toThrow("network");
    const ok = await guard();
    expect(ok.created).toBe(true);
    expect(b.createdCount()).toBe(1);
  });
});
