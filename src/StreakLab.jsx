import { useEffect, useState } from "react";
import App from "./App.jsx";
import { LAB_QUICK_VALUES, SignedInOverrideContext, StreakOverrideContext, parseLabStreak } from "./streakOverride.js";
import { prestigeTheme, streakCycle } from "./streakPrestige.js";
import "./streakLab.css";

// /streak-lab: a QA page for trying the real Home streak display at any
// streak on a real phone. It renders the whole real app, so the header, the
// streak, the puzzle and Play are the production components and CSS, with
// the streak the lab was given in place of the player's own (the context in
// streakOverride.js). Display only: it saves nothing and reads nothing back,
// and the app below is locked (inert) so it can't be played, which would
// otherwise save a real streak. Not linked from anywhere; kept out of
// search engines (a robots tag here, and X-Robots-Tag in vercel.json).

const readParam = () => parseLabStreak(new URLSearchParams(window.location.search).get("streak"));
const readSignedIn = () => new URLSearchParams(window.location.search).get("signedin") === "1";

// The address always names the value on screen, without reloading.
function writeParam(n, signedIn = readSignedIn()) {
  const url = new URL(window.location.href);
  url.searchParams.set("streak", String(n));
  if (signedIn) url.searchParams.set("signedin", "1"); else url.searchParams.delete("signedin");
  window.history.replaceState(null, "", url);
}

export default function StreakLab() {
  const [streak, setStreak] = useState(() => readParam() ?? 100);
  const [text, setText] = useState(String(streak));
  const [signedIn, setSignedIn] = useState(readSignedIn);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const title = document.title;
    document.title = "Streak Lab (QA only)";
    return () => { meta.remove(); document.title = title; };
  }, []);

  const show = (n) => {
    setStreak(n);
    setText(String(n));
    writeParam(n);
  };
  const onType = (value) => {
    setText(value);
    const n = parseLabStreak(value);
    if (n === null) return;
    setStreak(n);
    writeParam(n);
  };

  const toggleSignedIn = (on) => { setSignedIn(on); writeParam(streak, on); };

  const { cycleDay, prestigeCount } = streakCycle(streak);
  return (
    <>
      <section className="sl-bar" aria-label="Streak Lab controls">
        <p className="sl-title">STREAK LAB — QA ONLY</p>
        <label className="sl-field">
          <span>Streak:</span>
          <input type="number" inputMode="numeric" min="0" step="1" value={text}
            onChange={(e) => onType(e.target.value)} aria-label="Streak"/>
        </label>
        <label className="sl-check">
          <input type="checkbox" checked={signedIn} onChange={(e) => toggleSignedIn(e.target.checked)}/>
          <span>Pretend signed in (hides the sign-in nudge)</span>
        </label>
        <div className="sl-quick">
          {LAB_QUICK_VALUES.map((n) => (
            <button key={n} type="button" className={n === streak ? "is-on" : undefined} onClick={() => show(n)}>{n}</button>
          ))}
        </div>
        <p className="sl-note">
          {streak === 0 ? "0 shows no streak. " : `Shows ${streak} · lap day ${cycleDay} · prestige ${prestigeCount} (${prestigeTheme(prestigeCount)}). `}
          Display only: nothing is saved, and the page below is locked (scroll only).
        </p>
      </section>
      <StreakOverrideContext.Provider value={streak}>
        <SignedInOverrideContext.Provider value={signedIn}>
          <div className="sl-app" inert>
            <App/>
          </div>
        </SignedInOverrideContext.Provider>
      </StreakOverrideContext.Provider>
    </>
  );
}
