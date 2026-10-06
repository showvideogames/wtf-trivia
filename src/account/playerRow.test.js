// The production write path for the player row: the id in the row and the
// token on the request must come from the same session, even when another
// tab replaces the stored session at the worst moment. Run: npm run test:unit
import { describe, expect, it } from "vitest";
import { ensurePlayerRow, isAnonymousUser, playerRowRequest } from "./playerRow.js";

const session = (id, token, extra = {}) => ({ access_token: token, user: { id, is_anonymous: true, email: null, ...extra } });

// Records every request with the token it was signed with; serves the read-back.
function recorder() {
  const calls = [];
  const fetchWithToken = async (accessToken, path, init) => {
    calls.push({ accessToken, path, init, body: init?.body ? JSON.parse(init.body) : null });
    if (init?.method === "POST") return null;
    const id = new URL("http://x" + path).searchParams.get("id")?.replace("eq.", "");
    return [{ id, email: null, is_guest: true, created_at: "2026-10-06T00:00:00Z" }];
  };
  return { calls, fetchWithToken };
}

describe("player row: id and token come from one session read", () => {
  it("captures an old user, then the stored session is replaced: the row is written for the user whose token signs it", async () => {
    const storage = { session: session("old-user", "token-old") };
    const capturedBefore = storage.session.user; // what a caller read earlier (e.g. loadAppData's session)
    storage.session = session("new-guest", "token-new"); // another tab signed out and minted a guest
    const { calls, fetchWithToken } = recorder();

    const player = await ensurePlayerRow({ getSession: async () => storage.session, fetchWithToken });

    expect(capturedBefore.id).toBe("old-user");
    expect(player.id).toBe("new-guest");
    const post = calls.find((c) => c.init?.method === "POST");
    expect(post.body.id).toBe("new-guest");
    expect(post.accessToken).toBe("token-new");
    const get = calls.find((c) => !c.init?.method);
    expect(get.path).toContain("id=eq.new-guest");
    expect(get.accessToken).toBe("token-new");
    for (const c of calls) expect(c.accessToken).toBe("token-new");
  });

  it("a session swap DURING the write cannot split id and token: both requests still use the session that was read", async () => {
    const storage = { session: session("guest-a", "token-a") };
    const { calls, fetchWithToken } = recorder();
    const swapping = async (token, path, init) => {
      storage.session = session("guest-b", "token-b"); // another tab replaces the session mid-flight
      return fetchWithToken(token, path, init);
    };
    const player = await ensurePlayerRow({ getSession: async () => storage.session, fetchWithToken: swapping });
    expect(player.id).toBe("guest-a");
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.accessToken === "token-a")).toBe(true);
    expect(calls[0].body.id).toBe("guest-a");
    expect(calls[1].path).toContain("id=eq.guest-a");
  });

  it("the request shape is the game's: ignore-duplicates upsert with id, email, is_guest, last_seen_at", () => {
    const req = playerRowRequest(session("g1", "t1"), new Date("2026-10-06T12:00:00Z"));
    expect(req).toEqual({
      accessToken: "t1",
      userId: "g1",
      path: "/rest/v1/players",
      init: {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({ id: "g1", email: null, is_guest: true, last_seen_at: "2026-10-06T12:00:00.000Z" }),
      },
    });
    const acct = playerRowRequest({ access_token: "t2", user: { id: "a1", email: "x@y.z", is_anonymous: false } }, new Date(0));
    expect(JSON.parse(acct.init.body)).toMatchObject({ id: "a1", email: "x@y.z", is_guest: false });
  });

  it("a duplicate-key error on the POST is tolerated; any other error propagates", async () => {
    const storage = { session: session("g1", "t1") };
    const { fetchWithToken } = recorder();
    const dup = async (t, p, i) => { if (i?.method === "POST") throw new Error("Supabase error 409: duplicate key value"); return fetchWithToken(t, p, i); };
    expect((await ensurePlayerRow({ getSession: async () => storage.session, fetchWithToken: dup })).id).toBe("g1");
    const rls = async (t, p, i) => { if (i?.method === "POST") throw new Error("Supabase error 403: new row violates row-level security policy"); return fetchWithToken(t, p, i); };
    await expect(ensurePlayerRow({ getSession: async () => storage.session, fetchWithToken: rls })).rejects.toThrow(/403/);
  });

  it("no session → null, nothing sent", async () => {
    const { calls, fetchWithToken } = recorder();
    expect(await ensurePlayerRow({ getSession: async () => null, fetchWithToken })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("isAnonymousUser: the is_anonymous flag wins; otherwise no email and no identities means anonymous", () => {
    expect(isAnonymousUser({ is_anonymous: true })).toBe(true);
    expect(isAnonymousUser({ is_anonymous: false, email: null, identities: [] })).toBe(false);
    expect(isAnonymousUser({ email: null, identities: [] })).toBe(true);
    expect(isAnonymousUser({ email: "a@b.c" })).toBe(false);
  });
});
