// The Archive's favorites state and its optimistic heart toggle, kept apart
// from the screen so they can be tested.
//
// State:
//   mine    Set of this player's favorite puzzle ids, or null while loading
//           or when it couldn't load (hearts and the Favorites filter are
//           then unavailable, never shown as "none").
//   counts  { [puzzleId]: total favorites }, or null when unknown (cards
//           then show the heart without a count, never a false 0).
//   pending Set of puzzle ids whose save is in flight (repeat presses are
//           ignored until it settles).
//   error   { puzzleId, message } after a failed save, until dismissed or
//           the next save succeeds.

export const emptyFavorites = () => ({ mine: null, counts: null, pending: new Set(), error: null });

const withId = (set, id, on) => {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
};

export function favoriteErrorMessage(title, adding) {
  const name = title ? `“${title}”` : "that puzzle";
  return adding
    ? `Couldn't add ${name} to your favorites. Check your connection and try again.`
    : `Couldn't remove ${name} from your favorites. Check your connection and try again.`;
}

// Flips one heart at once (and its count by one), then saves. On success
// the count becomes the database's own total; on failure that puzzle's
// heart and count go back to exactly what they were and an error stays up.
// Other puzzles' hearts are never touched. `save(puzzleId, on)` resolves to
// the new total (or anything non-numeric when unknown) or rejects.
// Returns "ignored", "saved" or "failed".
export async function toggleFavorite({ puzzleId, title, getState, setState, save }) {
  const start = getState();
  if (!start.mine || start.pending.has(puzzleId)) return "ignored";
  const adding = !start.mine.has(puzzleId);
  const hadCount = Boolean(start.counts) && Object.prototype.hasOwnProperty.call(start.counts, puzzleId);
  const previousCount = start.counts?.[puzzleId];

  setState((s) => ({
    ...s,
    mine: withId(s.mine, puzzleId, adding),
    counts: s.counts
      ? { ...s.counts, [puzzleId]: Math.max(0, (Number(s.counts[puzzleId]) || 0) + (adding ? 1 : -1)) }
      : s.counts,
    pending: withId(s.pending, puzzleId, true),
  }));

  try {
    const total = await save(puzzleId, adding);
    setState((s) => ({
      ...s,
      counts: s.counts && Number.isFinite(total) ? { ...s.counts, [puzzleId]: Math.max(0, total) } : s.counts,
      pending: withId(s.pending, puzzleId, false),
      error: s.error?.puzzleId === puzzleId ? null : s.error,
    }));
    return "saved";
  } catch {
    setState((s) => {
      let counts = s.counts;
      if (counts) {
        counts = { ...counts };
        if (hadCount) counts[puzzleId] = previousCount;
        else delete counts[puzzleId];
      }
      return {
        ...s,
        mine: s.mine ? withId(s.mine, puzzleId, !adding) : s.mine,
        counts,
        pending: withId(s.pending, puzzleId, false),
        error: { puzzleId, message: favoriteErrorMessage(title, adding) },
      };
    });
    return "failed";
  }
}
