// Resolve a complete view of one player's account before publishing any of it.
// An auth event invalidates pending loads immediately, including loads that
// timed out while their underlying requests are still running.
export function createAccountDataLoader(deps) {
  let version = 0;
  return {
    invalidate() { version += 1; },
    async load(sessionOverride, { recoverAuth = false, today }, publish) {
      const ticket = ++version;
      const current = () => ticket === version;
      try {
        const session = sessionOverride || await deps.ensureSession({ recover: recoverAuth });
        if (!current()) return false;
        const resolved = await deps.resolveAccount(session);
        if (!current()) return false;
        const player = await deps.getPlayer(resolved.session?.user);
        if (!current()) return false;
        if (!player?.id) throw new Error("Player session could not be created.");
        // getPlayer re-reads the signing session to bind its row and token.
        // It may therefore return a different user than resolveAccount saw.
        if (player.id !== resolved.session?.user?.id ||
            (resolved.account && resolved.account.user_id !== player.id)) {
          throw new Error("Account changed while loading. Please retry.");
        }
        const accountPlayer = resolved.account ? {
          ...player, isGuest: false, email: resolved.account.email || player.email,
          globalUserId: resolved.account.global_user_id,
        } : player;
        const adminStatus = await deps.resolveAdminStatus(resolved);
        if (!current()) return false;
        const handoff = resolved.account ? await deps.resolveHandoff().catch(() => null) : null;
        if (!current()) return false;
        const [games, stats] = await Promise.all([deps.loadGames(), deps.getStats(player.id)]);
        if (!current()) return false;
        const game = games.find(g => g.date === today && g.status === "published");
        const record = game ? await deps.getRecord(player.id, game.id) : null;
        if (!current()) return false;
        publish({ player: accountPlayer, adminStatus, handoff, games, stats, record, notice: resolved.notice, today });
        return true;
      } catch (error) {
        if (!current()) return false;
        throw error;
      }
    },
  };
}
