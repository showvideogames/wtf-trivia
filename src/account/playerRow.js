// The player row (public.players) for the session that signs the request.
//
// Every tab shares the stored Supabase session. Between "which user am I?"
// and "send the request", another tab can replace that session (a sign-out
// elsewhere, a guest minted by a sibling tab). If the id in the row and the
// token on the request then come from two different reads, the write is
// refused by RLS (403) and the tab shows the boot error page. So the row is
// written from ONE session read: the same object supplies both the user id
// in the body and the access token on the request, for the POST and for the
// read-back that follows it.

export function isAnonymousUser(user) {
  return Boolean(user?.is_anonymous ?? (!user?.email && (!Array.isArray(user?.identities) || user.identities.length === 0)));
}

/** The exact request the game sends to create (or touch) a player row for `session`. */
export function playerRowRequest(session, now = new Date()) {
  const user = session.user;
  return {
    accessToken: session.access_token,
    userId: user.id,
    path: "/rest/v1/players",
    init: {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({
        id: user.id,
        email: user.email || null,
        is_guest: isAnonymousUser(user),
        last_seen_at: now.toISOString(),
      }),
    },
  };
}

/**
 * Ensure the signing session has its player row and return the player.
 *
 * @param {object} deps
 * @param {() => Promise<object|null>} deps.getSession            read the stored session (one call, here)
 * @param {(accessToken: string, path: string, init?: object) => Promise<any>} deps.fetchWithToken
 *        the game's PostgREST fetch, signing with EXACTLY the token it is given
 * @param {() => Date} [deps.now]
 * @returns the player ({ id, email, isGuest, createdAt }) or null when there is no session
 */
export async function ensurePlayerRow({ getSession, fetchWithToken, now = () => new Date() }) {
  const session = await getSession();
  if (!session?.user?.id || !session.access_token) return null;
  const req = playerRowRequest(session, now());
  try {
    await fetchWithToken(req.accessToken, req.path, req.init);
  } catch (e) {
    if (!String(e?.message || "").includes("duplicate key")) throw e;
  }
  const rows = await fetchWithToken(req.accessToken, `/rest/v1/players?id=eq.${req.userId}&select=*`);
  const row = Array.isArray(rows) ? rows[0] : null;
  const user = session.user;
  return {
    id: req.userId,
    email: row?.email ?? user.email ?? null,
    isGuest: row?.is_guest ?? isAnonymousUser(user),
    createdAt: row?.created_at ?? user.created_at ?? now().toISOString(),
  };
}
