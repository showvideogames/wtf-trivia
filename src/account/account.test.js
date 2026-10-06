// @vitest-environment jsdom
// Unit tests for the account modules (jsdom; no network). Run: npm run test:unit
//
// U1 configuration portability   U2 sign-in reachability + the guest handoff offer
// U3 callback handling           U4 provider tokens forgotten
// U5 ensureAccount outcomes      U6 the pending handoff (resolve / import / decline)
// U7 sign-out / deletion         U8 return-path safety   U9 storage key keeps existing guests
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── a controllable fake Supabase client ──
const fake = {
  signInWithOAuth: vi.fn(async () => ({ error: null })),
  exchangeCodeForSession: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => {
    localStorage.removeItem("sb-127-auth-token");
    return { error: null };
  }),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  rpc: vi.fn(async () => ({ data: null, error: null })),
};
vi.mock("./supabaseClient.js", () => ({
  AUTH_STORAGE_KEY: "sb-127-auth-token",
  supabase: {
    auth: {
      signInWithOAuth: (...a) => fake.signInWithOAuth(...a),
      exchangeCodeForSession: (...a) => fake.exchangeCodeForSession(...a),
      signOut: (...a) => fake.signOut(...a),
      getSession: (...a) => fake.getSession(...a),
    },
    rpc: (...a) => fake.rpc(...a),
  },
}));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (!["node_modules", "dist", ".git", "fixtures.local"].includes(name)) walk(p, out); }
    else out.push(p);
  }
  return out;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:1");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("VITE_PLATFORM_DISCOVERY_URL", "http://127.0.0.1:1/.well-known/openid-configuration");
  vi.stubEnv("VITE_ACCOUNTS_ENABLED", "true");
  for (const f of Object.values(fake)) f.mockClear?.();
  fake.rpc.mockImplementation(async () => ({ data: null, error: null }));
  fake.getSession.mockImplementation(async () => ({ data: { session: null } }));
  fake.signInWithOAuth.mockImplementation(async () => ({ error: null }));
  fake.exchangeCodeForSession.mockImplementation(async () => ({ error: null }));
  window.history.replaceState(null, "", "/");
  vi.resetModules();
});

// ── U1 portability ──
describe("U1 configuration portability", () => {
  it("no hosted Supabase address, project ref, key or sign-in domain is written into src/, supabase/migrations or tools", () => {
    // Secrets and hosted addresses: nowhere. A sign-in domain: nowhere in the
    // app or the schema (tools/workos.mjs names the Production domain only to
    // refuse it, so it is checked for keys and refs but not for domains).
    const app = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "supabase", "migrations"))].filter((f) => !/\.test\.jsx?$/.test(f));
    const tools = walk(path.join(ROOT, "tools"));
    const secrets = [/\b[a-z]{20}\.supabase\.co\b/, /\bujhw[a-z]{16}\b/, /sb_secret_[A-Za-z0-9_-]{10,}/, /eyJhbGciOi[A-Za-z0-9_-]{20,}/, /sbp_[A-Za-z0-9]{20,}/];
    const domains = [/[a-z0-9-]+\.authkit\.app/];
    const offenders = [];
    const scan = (files, patterns) => {
      for (const f of files) {
        if (/\.(png|webp|jpg|gif|svg|avif|ico)$/i.test(f)) continue;
        const text = readFileSync(f, "utf8");
        for (const re of patterns) if (re.test(text)) offenders.push(`${path.relative(ROOT, f)} matches ${re}`);
      }
    };
    scan(app, [...secrets, ...domains]);
    scan(tools, secrets);
    expect(offenders).toEqual([]);
  });

  it("with no project configured the app is in offline mode and accounts are off; with a project but no discovery URL accounts are off", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    let cfg = await import("../game/config.js");
    expect(cfg.SUPABASE_CONFIGURED).toBe(false);
    expect(cfg.ACCOUNTS_ENABLED).toBe(false);
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:1");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "k");
    vi.stubEnv("VITE_PLATFORM_DISCOVERY_URL", "");
    cfg = await import("../game/config.js");
    expect(cfg.SUPABASE_CONFIGURED).toBe(true);
    expect(cfg.ACCOUNTS_ENABLED).toBe(false);
  });

  it("the kill switch turns accounts off without a schema change; the publishable-key alias is accepted", async () => {
    vi.stubEnv("VITE_ACCOUNTS_ENABLED", "false");
    let cfg = await import("../game/config.js");
    expect(cfg.ACCOUNTS_ENABLED).toBe(false);
    vi.resetModules();
    vi.stubEnv("VITE_ACCOUNTS_ENABLED", "true");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    cfg = await import("../game/config.js");
    expect(cfg.SUPABASE_KEY).toBe("sb_publishable_x");
    expect(cfg.ACCOUNTS_ENABLED).toBe(true);
  });
});

// ── U9 storage key ──
describe("U9 the session storage key is supabase-js's own default, so existing guest sessions survive", () => {
  it("derives sb-<host label>-auth-token from the project URL", async () => {
    const { authStorageKey } = await import("../game/config.js");
    expect(authStorageKey("https://abcdefghijklmnopqrst.supabase.co")).toBe("sb-abcdefghijklmnopqrst-auth-token");
    expect(authStorageKey("http://127.0.0.1:55621")).toBe("sb-127-auth-token");
  });
});

// ── U2 sign-in ──
describe("U2 signInWithPlatform", () => {
  it("probes the discovery document first and never navigates when the provider is unreachable (guests unaffected)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("blocked"); }));
    const m = await import("./platformSignIn.js");
    const msg = await m.signInWithPlatform({ isGuest: true });
    expect(msg).toBe(m.HUB_UNAVAILABLE);
    expect(fake.signInWithOAuth).not.toHaveBeenCalled();
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("wtf-guest-handoff")).toBeNull();
  });

  it("a guest with history mints a handoff code (stored for this tab), remembers the return path, then redirects with PKCE to /auth/callback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    fake.rpc.mockImplementation(async (fn) => fn === "offer_guest_history"
      ? { data: [{ outcome: "ok", code: "c".repeat(32), plays: 3, finished: 2, current_streak: 2, longest_streak: 2, favorites: 1 }], error: null }
      : { data: null, error: null });
    window.history.replaceState(null, "", "/archive?x=1");
    const m = await import("./platformSignIn.js");
    const msg = await m.signInWithPlatform({ isGuest: true });
    expect(msg).toBeNull();
    expect(fake.rpc).toHaveBeenCalledWith("offer_guest_history");
    const pending = JSON.parse(sessionStorage.getItem("wtf-guest-handoff"));
    expect(pending.code).toBe("c".repeat(32));
    expect(pending.summary.finished).toBe(2);
    expect(sessionStorage.getItem("wtf-auth-return-to")).toBe("/archive?x=1");
    expect(fake.signInWithOAuth).toHaveBeenCalledWith({
      provider: "custom:platform",
      options: { redirectTo: `${window.location.origin}/auth/callback`, scopes: "openid email profile" },
    });
  });

  it("a guest without history stores nothing and still signs in; an offer failure never blocks the sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    fake.rpc.mockImplementation(async () => ({ data: [{ outcome: "no_history" }], error: null }));
    const m = await import("./platformSignIn.js");
    expect(await m.signInWithPlatform({ isGuest: true })).toBeNull();
    expect(sessionStorage.getItem("wtf-guest-handoff")).toBeNull();
    fake.rpc.mockImplementation(async () => { throw new Error("boom"); });
    expect(await m.signInWithPlatform({ isGuest: true })).toBeNull();
    expect(fake.signInWithOAuth).toHaveBeenCalledTimes(2);
  });

  it("a signed-in (non-guest) session does not offer a handoff", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    const m = await import("./platformSignIn.js");
    await m.signInWithPlatform({ isGuest: false });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("with accounts off it refuses without touching the network", async () => {
    vi.stubEnv("VITE_PLATFORM_DISCOVERY_URL", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = await import("./platformSignIn.js");
    expect(await m.signInWithPlatform({ isGuest: true })).toBe(m.HUB_UNAVAILABLE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── U3 callback ──
describe("U3 handleCallback", () => {
  it("exchanges the code once, strips it from the address bar and returns the remembered same-origin path", async () => {
    sessionStorage.setItem("wtf-auth-return-to", "/archive");
    window.history.replaceState(null, "", "/auth/callback?code=abc123");
    const m = await import("./platformSignIn.js");
    const r = await m.handleCallback();
    expect(r).toEqual({ ok: true, returnTo: "/archive" });
    expect(fake.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/auth/callback");
    expect(sessionStorage.getItem("wtf-auth-return-to")).toBeNull();
  });

  it("a provider error, a missing code or a failed exchange is a sentence and a way back; the guest's storage is untouched", async () => {
    sessionStorage.setItem("wtf-guest-handoff", JSON.stringify({ code: "c".repeat(32) }));
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "guest" }));
    window.history.replaceState(null, "", "/auth/callback?error=access_denied&error_description=Nope");
    const m = await import("./platformSignIn.js");
    let r = await m.handleCallback();
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toBe("Nope");
    expect(fake.exchangeCodeForSession).not.toHaveBeenCalled();

    window.history.replaceState(null, "", "/auth/callback");
    r = await m.handleCallback();
    expect(r.errorCode).toBe("missing_code");

    fake.exchangeCodeForSession.mockImplementation(async () => ({ error: { code: "bad_code", message: "invalid" } }));
    window.history.replaceState(null, "", "/auth/callback?code=x");
    r = await m.handleCallback();
    expect(r).toMatchObject({ ok: false, errorCode: "bad_code", errorMessage: "invalid" });
    expect(sessionStorage.getItem("wtf-guest-handoff")).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("sb-127-auth-token")).access_token).toBe("guest");
  });

  it("an off-origin return path is ignored", async () => {
    sessionStorage.setItem("wtf-auth-return-to", "https://evil.example/x");
    window.history.replaceState(null, "", "/auth/callback?code=abc");
    const m = await import("./platformSignIn.js");
    expect((await m.handleCallback()).returnTo).toBe("/");
  });
});

// ── U4 provider token ──
describe("U4 forgetHubTokens", () => {
  it("removes the provider tokens from the stored session and keeps the local session", async () => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "local", refresh_token: "r", provider_token: "hub", provider_refresh_token: "hubr" }));
    const m = await import("./platformSignIn.js");
    m.forgetHubTokens();
    const stored = JSON.parse(localStorage.getItem("sb-127-auth-token"));
    expect(stored.access_token).toBe("local");
    expect(stored.provider_token).toBeUndefined();
    expect(stored.provider_refresh_token).toBeUndefined();
  });
});

// ── U5 ensureAccount ──
describe("U5 ensureAccount", () => {
  it("ok publishes the account as the server reports it (email from the server, never the auth user)", async () => {
    fake.rpc.mockImplementation(async () => ({ data: [{ outcome: "ok", user_id: "u1", global_user_id: "user_01ABCDEFGHIJKLMNOP", email: "current@example.com", created_at: "2026-10-06" }], error: null }));
    const m = await import("./platformSignIn.js");
    const r = await m.ensureAccount();
    expect(r.ok).toBe(true);
    expect(r.account).toEqual({ user_id: "u1", global_user_id: "user_01ABCDEFGHIJKLMNOP", email: "current@example.com", created_at: "2026-10-06" });
  });

  it("not_platform_linked signs out locally (scope local) and says it is not a WTF account", async () => {
    fake.rpc.mockImplementation(async () => ({ data: [{ outcome: "not_platform_linked" }], error: null }));
    const m = await import("./platformSignIn.js");
    const r = await m.ensureAccount();
    expect(r.reason).toBe("not_platform_linked");
    expect(r.message).toBe(m.NOT_WTF_ACCOUNT);
    expect(fake.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("a transport error keeps the session (unavailable) so the next load can retry", async () => {
    fake.rpc.mockImplementation(async () => ({ data: null, error: { message: "fetch failed" } }));
    const m = await import("./platformSignIn.js");
    const r = await m.ensureAccount();
    expect(r.reason).toBe("unavailable");
    expect(fake.signOut).not.toHaveBeenCalled();
  });
});

// ── U6 the pending handoff ──
describe("U6 guest handoff on the account side", () => {
  const pending = { code: "c".repeat(32), offeredAt: 1, summary: {} };

  it("nothing pending → nothing to ask", async () => {
    const h = await import("./guestHandoff.js");
    expect(await h.resolvePendingHandoff()).toBeNull();
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("a valid code resolves to the prompt summary; a spent/expired/invalid code is forgotten; a transport error keeps it for next time", async () => {
    sessionStorage.setItem("wtf-guest-handoff", JSON.stringify(pending));
    fake.rpc.mockImplementation(async () => ({ data: [{ outcome: "ok", plays: 3, finished: 2, current_streak: 2, longest_streak: 4, favorites: 1, account_has_history: true }], error: null }));
    const h = await import("./guestHandoff.js");
    expect(await h.resolvePendingHandoff()).toEqual({ plays: 3, finished: 2, currentStreak: 2, longestStreak: 4, favorites: 1, accountHasHistory: true });
    expect(fake.rpc).toHaveBeenCalledWith("resolve_guest_handoff", { _code: pending.code });
    expect(sessionStorage.getItem("wtf-guest-handoff")).not.toBeNull();

    fake.rpc.mockImplementation(async () => ({ data: null, error: { message: "offline" } }));
    expect(await h.resolvePendingHandoff()).toBeNull();
    expect(sessionStorage.getItem("wtf-guest-handoff")).not.toBeNull();

    fake.rpc.mockImplementation(async () => ({ data: [{ outcome: "expired" }], error: null }));
    expect(await h.resolvePendingHandoff()).toBeNull();
    expect(sessionStorage.getItem("wtf-guest-handoff")).toBeNull();
  });

  it("Add my progress imports once and forgets the code whatever the server said", async () => {
    sessionStorage.setItem("wtf-guest-handoff", JSON.stringify(pending));
    fake.rpc.mockImplementation(async () => ({ data: [{ outcome: "imported", plays_moved: 3, plays_dropped: 1, favorites_moved: 1 }], error: null }));
    const h = await import("./guestHandoff.js");
    expect(await h.importPendingHandoff()).toEqual({ ok: true, outcome: "imported", moved: 3, dropped: 1, favorites: 1 });
    expect(fake.rpc).toHaveBeenCalledWith("import_guest_history", { _code: pending.code });
    expect(sessionStorage.getItem("wtf-guest-handoff")).toBeNull();
    expect((await h.importPendingHandoff()).ok).toBe(false);

    sessionStorage.setItem("wtf-guest-handoff", JSON.stringify(pending));
    fake.rpc.mockImplementation(async () => ({ data: [{ outcome: "invalid" }], error: null }));
    expect((await h.importPendingHandoff()).outcome).toBe("invalid");
    expect(sessionStorage.getItem("wtf-guest-handoff")).toBeNull();
  });

  it("Start fresh declines on the server and forgets the code even when the server is unreachable", async () => {
    sessionStorage.setItem("wtf-guest-handoff", JSON.stringify(pending));
    fake.rpc.mockImplementation(async () => ({ data: [{ outcome: "started_fresh" }], error: null }));
    const h = await import("./guestHandoff.js");
    expect(await h.declinePendingHandoff()).toBe("started_fresh");
    expect(fake.rpc).toHaveBeenCalledWith("decline_guest_history", { _code: pending.code });
    expect(sessionStorage.getItem("wtf-guest-handoff")).toBeNull();
    sessionStorage.setItem("wtf-guest-handoff", JSON.stringify(pending));
    fake.rpc.mockImplementation(async () => { throw new Error("offline"); });
    expect(await h.declinePendingHandoff()).toBe("unavailable");
    expect(sessionStorage.getItem("wtf-guest-handoff")).toBeNull();
  });

  it("a malformed pending entry is ignored", async () => {
    sessionStorage.setItem("wtf-guest-handoff", "{not json");
    const h = await import("./guestHandoff.js");
    expect(h.readPendingHandoff()).toBeNull();
    sessionStorage.setItem("wtf-guest-handoff", JSON.stringify({ code: "short" }));
    expect(h.readPendingHandoff()).toBeNull();
  });
});

// ── U7 sign-out / deletion ──
describe("U7 sign-out and deletion", () => {
  it("sign-out is local only and forgets any pending handoff", async () => {
    sessionStorage.setItem("wtf-guest-handoff", JSON.stringify({ code: "c".repeat(32) }));
    const m = await import("./platformSignIn.js");
    await m.signOutOfWtf();
    expect(fake.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(sessionStorage.getItem("wtf-guest-handoff")).toBeNull();
  });

  it("deleteMyAccount drops the stored session before the local sign-out; a non-account is told so", async () => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "x" }));
    fake.rpc.mockImplementation(async () => ({ data: true, error: null }));
    const m = await import("./platformSignIn.js");
    expect(await m.deleteMyAccount()).toEqual({ ok: true });
    expect(localStorage.getItem("sb-127-auth-token")).toBeNull();
    expect(fake.signOut).toHaveBeenCalledWith({ scope: "local" });
    fake.rpc.mockImplementation(async () => ({ data: false, error: null }));
    expect((await m.deleteMyAccount()).ok).toBe(false);
  });
});

// ── U8 return path ──
describe("U8 safeInternalPath", () => {
  it("accepts only same-origin paths", async () => {
    const { safeInternalPath } = await import("./safePath.js");
    const o = "https://game.example";
    expect(safeInternalPath("/archive?x=1#y", o)).toBe("/archive?x=1#y");
    expect(safeInternalPath("//evil.example/x", o)).toBe("/");
    expect(safeInternalPath("https://evil.example/x", o)).toBe("/");
    expect(safeInternalPath("/\\evil", o)).toBe("/");
    expect(safeInternalPath("javascript:alert(1)", o)).toBe("/");
    expect(safeInternalPath(null, o)).toBe("/");
    expect(safeInternalPath("/" + "a".repeat(600), o)).toBe("/");
  });
});
