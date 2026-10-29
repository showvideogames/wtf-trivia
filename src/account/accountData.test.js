import { expect, it, vi } from "vitest";
import { createAccountDataLoader } from "./accountData.js";
const today = "2026-10-29";
const session = id => ({ user: { id } });
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
function setup() {
  const deps = {
    ensureSession: vi.fn(async () => session("a")),
    resolveAccount: vi.fn(async s => ({ session: s, account: { user_id: s.user.id, email: `${s.user.id}@test.invalid`, global_user_id: `global-${s.user.id}` }, notice: null })),
    getPlayer: vi.fn(async user => ({ id: user.id, isGuest: true })),
    resolveAdminStatus: vi.fn(async () => "not_admin"),
    resolveHandoff: vi.fn(async () => null),
    loadGames: vi.fn(async () => [{ id: "puzzle", date: today, status: "published" }]),
    getStats: vi.fn(async id => ({ owner: id })),
    getRecord: vi.fn(async id => ({ owner: id, score: 3 })),
  };
  return { deps, loader: createAccountDataLoader(deps), publish: vi.fn() };
}
it("publishes matching account, player, stats and result together", async () => {
  const { deps, loader, publish } = setup();
  const record = deferred();
  deps.getRecord.mockReturnValueOnce(record.promise);
  const load = loader.load(null, { today }, publish);
  await vi.waitFor(() => expect(deps.getRecord).toHaveBeenCalled());
  expect(publish).not.toHaveBeenCalled();
  record.resolve({ owner: "a", score: 3 });
  expect(await load).toBe(true);
  expect(publish).toHaveBeenCalledWith(expect.objectContaining({
    player: { id: "a", isGuest: false, email: "a@test.invalid", globalUserId: "global-a" },
    stats: { owner: "a" }, record: { owner: "a", score: 3 },
  }));
});
it("never attaches old account details to a replacement guest player row", async () => {
  const { deps, loader, publish } = setup();
  deps.getPlayer.mockResolvedValue({ id: "new-guest", isGuest: true });
  await expect(loader.load(session("a"), { today }, publish)).rejects.toThrow("Account changed");
  expect(publish).not.toHaveBeenCalled();
  expect(deps.resolveAdminStatus).not.toHaveBeenCalled();
});
it("rejects an account RPC belonging to a different identity", async () => {
  const { deps, loader, publish } = setup();
  deps.resolveAccount.mockResolvedValue({ session: session("a"), account: { user_id: "b" } });
  await expect(loader.load(session("a"), { today }, publish)).rejects.toThrow("Account changed");
  expect(publish).not.toHaveBeenCalled();
});
it("discards old stats after sign-out even before the new load starts", async () => {
  const { deps, loader, publish } = setup();
  const stats = deferred();
  deps.getStats.mockReturnValueOnce(stats.promise);
  const load = loader.load(session("a"), { today }, publish);
  await vi.waitFor(() => expect(deps.getStats).toHaveBeenCalled());
  loader.invalidate();
  stats.resolve({ owner: "a" });
  expect(await load).toBe(false);
  expect(publish).not.toHaveBeenCalled();
  expect(deps.getRecord).not.toHaveBeenCalled();
});
it("an old result cannot overwrite the newer account snapshot", async () => {
  const { deps, loader, publish } = setup();
  const old = deferred();
  deps.getRecord.mockReturnValueOnce(old.promise);
  const first = loader.load(session("a"), { today }, publish);
  await vi.waitFor(() => expect(deps.getRecord).toHaveBeenCalled());
  await loader.load(session("b"), { today }, publish);
  old.resolve({ owner: "a" });
  expect(await first).toBe(false);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls[0][0].player.id).toBe("b");
  expect(publish.mock.calls[0][0].record.owner).toBe("b");
});
it("stale failures cannot trigger a recovery load over the new account", async () => {
  const { deps, loader, publish } = setup();
  const old = deferred();
  deps.resolveAccount.mockReturnValueOnce(old.promise);
  const first = loader.load(session("a"), { today }, publish);
  loader.invalidate();
  old.reject(new Error("old network error"));
  expect(await first).toBe(false);
  expect(publish).not.toHaveBeenCalled();
});
it("keeps guest state without querying account-only handoff", async () => {
  const { deps, loader, publish } = setup();
  deps.resolveAccount.mockResolvedValue({ session: session("guest"), account: null, notice: null });
  await loader.load(session("guest"), { today }, publish);
  expect(publish.mock.calls[0][0].player).toEqual({ id: "guest", isGuest: true });
  expect(deps.resolveHandoff).not.toHaveBeenCalled();
});
