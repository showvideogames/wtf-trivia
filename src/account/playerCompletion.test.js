import { expect, it, vi } from "vitest";
import { bindPlayerRequest } from "./playerRow.js";
import { syncFinishedPlayerStats } from "../playerStats.js";

for (const replacement of ["alice", "bob"]) {
  it(`finishes Alice's durable stats after UI invalidation (${replacement} session)`, async () => {
    let session = { user: { id: "alice" }, access_token: "alice-token" };
    const getSession = vi.fn(async () => session);
    const requests = [];
    const fetchWithToken = vi.fn(async (token, path) => { requests.push({ token, path }); return { totalPlayed: 1 }; });
    const request = await bindPlayerRequest({ playerId: "alice", getSession, fetchWithToken });
    // Completion committed for Alice; USER_UPDATED or an account switch arrives
    // before its response. The UI epoch is now stale, but the save must finish.
    await request("/completion");
    session = { user: { id: replacement }, access_token: "replacement-token" };
    const publish = vi.fn();
    await syncFinishedPlayerStats({
      update: () => request("/player-stats"), read: () => request("/read-stats"),
      publish, isCurrent: () => false,
    });
    expect(requests).toEqual([
      { token: "alice-token", path: "/completion" },
      { token: "alice-token", path: "/player-stats" },
    ]);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });
}
it("refuses completion setup when the session has already switched owner", async () => {
  const fetchWithToken = vi.fn();
  await expect(bindPlayerRequest({ playerId: "alice", getSession: async () => ({ user: { id: "bob" }, access_token: "bob-token" }), fetchWithToken })).rejects.toThrow("Account changed");
  expect(fetchWithToken).not.toHaveBeenCalled();
});
it("does not publish stats when identity changes during their read", async () => {
  const update = vi.fn(async () => {});
  let current = true;
  const read = vi.fn(async () => { current = false; return { totalPlayed: 1 }; });
  const publish = vi.fn();
  await syncFinishedPlayerStats({ update, read, publish, isCurrent: () => current });
  expect(update).toHaveBeenCalledTimes(1);
  expect(publish).not.toHaveBeenCalled();
});
