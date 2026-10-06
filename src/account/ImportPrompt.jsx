import { useState } from "react";
import "./account.css";

/**
 * "Bring your progress with you?" — shown once, after the first sign-in from
 * a browser whose guest had plays or favorites (the guest handoff,
 * guestHandoff.js). Add my progress moves the guest's rows into the account;
 * Start fresh leaves the account as it is. Either way the decision is final
 * and nothing is merged silently.
 */
export default function ImportPrompt({ summary, onAdd, onStartFresh }) {
  const [busy, setBusy] = useState(false);
  const { finished = 0, plays = 0, currentStreak = 0, favorites = 0, accountHasHistory = false } = summary || {};
  const noun = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const parts = [];
  if (finished > 0) parts.push(noun(finished, "finished game", "finished games"));
  else if (plays > 0) parts.push(noun(plays, "game in progress", "games in progress"));
  if (currentStreak > 1) parts.push(`a ${currentStreak}-day streak`);
  if (favorites > 0) parts.push(noun(favorites, "favorite", "favorites"));
  return (
    <div className="wtf-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="wtf-import-title" data-testid="import-prompt">
      <div className="wtf-modal">
        <h2 id="wtf-import-title">Bring your progress with you?</h2>
        <p>
          This browser has played WTF Trivia as a guest: {parts.length ? parts.join(", ") : "a little history"}.
        </p>
        <p className="wtf-muted">
          {accountHasHistory
            ? "Add it and it joins the games already on your account (a puzzle played on both keeps the better result). Start fresh and your account stays as it is."
            : "Add it to your account and it follows you to every device. Start fresh and your account begins empty."}
        </p>
        <div className="wtf-row">
          <button
            type="button"
            className="wtf-btn"
            data-testid="import-add"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onAdd(); } finally { setBusy(false); } }}
          >
            Add my progress
          </button>
          <button type="button" className="wtf-btn wtf-btn-quiet" data-testid="import-start-fresh" disabled={busy} onClick={onStartFresh}>
            Start fresh
          </button>
        </div>
      </div>
    </div>
  );
}
