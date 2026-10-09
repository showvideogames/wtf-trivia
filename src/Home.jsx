import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CandyPageShell from "./CandyPageShell.jsx";
import CategoryArtImage from "./CategoryArtImage.jsx";
import { shareFeedback } from "./homeShare.js";
import { MAX_INDIVIDUAL_MEDALS, prestigeTheme, streakCycle, streakFontForWidth, streakGrowth, streakSqueeze, totalStreakText } from "./streakPrestige.js";
import { countdownGroups, countdownTier, countdownWords } from "./schedule.js";

// ---- HOME ----
// The category-first Home page, built on the Archive's custard shell. The
// daily poster is the star, the Play button is the one big action, and
// everything else supports those two. App.jsx keeps the data and behaviour
// (start/resume, results, share, navigation) and draws the shared
// PlayerHeader above every screen; these are the presentational pieces, plus
// the loading and error pages, which reuse the same shell so the finished
// page doesn't jump.

// The page frame: shell, then the centred hero column.
export function HomePage({ children }) {
  return (
    <CandyPageShell className="hm-page">
      <div className="hm-inner">
        <main className="hm-main">{children}</main>
      </div>
    </CandyPageShell>
  );
}

// `hideEyebrow` keeps the eyebrow for screen readers only (Home drops the
// visible "Today's puzzle" label; its streak display leads the page instead).
export function HomeHeading({ eyebrow, title, hideEyebrow = false }) {
  return (
    <div className="hm-heading">
      <p className={hideEyebrow ? "hm-sr-only" : "hm-eyebrow"}>{eyebrow}</p>
      <h1 className="hm-title">{title}</h1>
    </div>
  );
}

// Longer names step down a size so they wrap onto two or three lines inside
// their half rather than overflowing it. Both halves use the size the longer
// name needs, so the pair always matches.
function nameSizeClass(a, b) {
  const n = Math.max((a || "").trim().length, (b || "").trim().length);
  if (n <= 12) return "hm-name is-short";
  if (n <= 20) return "hm-name";
  if (n <= 32) return "hm-name is-long";
  return "hm-name is-xlong";
}

function MatchupHalf({ name, image, color, fallbackCandy, nameClass }) {
  return (
    <div className="hm-half" style={{ "--hm-cat": color.mid }}>
      <div className="hm-half-art">
        <CategoryArtImage image={image} loading="eager"
          fallback={<img className="hm-half-candy" src={fallbackCandy} alt=""/>}/>
      </div>
      <span className={nameClass}>{name}</span>
    </div>
  );
}

function OrBurst() {
  return (
    <span className="hm-or" aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <path className="hm-or-burst"
          d="M50 3l8.2 15.6 15.5-8.4-1.2 17.6 17.5 1.9-11 13.8 14 10.7-16.6 5.9 6.3 16.5-17.3-3.3-2.5 17.5L50 85.6 36.9 97.2l-2.4-17.5-17.4 3.4 6.4-16.5L6.9 60.8l14-10.7-11-13.8 17.5-2L26.3 16.7l15.5 8.4z"/>
        <text x="50" y="52" textAnchor="middle" dominantBaseline="central">OR</text>
      </svg>
    </span>
  );
}

// The two categories side by side, each image whole (`contain`ed with
// padding, never cropped or stretched) on its saved colour, its saved name
// set as live text underneath, and the comic OR on the divider. Announced
// as one picture: "Led Zeppelin or My Little Pony".
export function HomeMatchup({ game, colors }) {
  const [colA, colB] = colors;
  const nameClass = nameSizeClass(game.categoryA, game.categoryB);
  return (
    <div className="hm-matchup" role="img" aria-label={`${game.categoryA} or ${game.categoryB}`}>
      <div className="hm-matchup-grid">
        <MatchupHalf name={game.categoryA} image={game.categoryAImage} color={colA} fallbackCandy="/candy-turquoise.png" nameClass={nameClass}/>
        <MatchupHalf name={game.categoryB} image={game.categoryBImage} color={colB} fallbackCandy="/candy-pink.png" nameClass={nameClass}/>
      </div>
      <OrBurst/>
    </div>
  );
}

// The square poster is swapped for the wide artwork when the height left
// for it (100svh minus --hm-reserve: everything else that must stay on
// screen plus ~60px of air, the same value the square is sized by) is under
// this share of the column width, i.e. the square could no longer be shown
// at (nearly) full width with the primary action on screen. Measured on
// phones (390 wide): 218px above and below the square unplayed, 247px in
// progress, 332px finished (down to See my results). So 360x640 unplayed
// keeps the square (94px spare), 360x640 with toolbars showing (~360x560)
// switches, and a 390x844 iPhone in Safari (svh ~664) keeps it unplayed and
// in progress (ratios 1.07 and 0.99); finished Home switches wherever the
// square would lose more than 5% of its width.
export const SHORT_HERO_FIT = 0.95;

// Whether this screen is too short for the square poster and its action.
// It reads a probe sized purely in svh (the viewport with browser toolbars
// shown), so toolbars sliding in and out never swap the poster: only a
// real size change (rotation, a resized window, another Home state) does.
// Desktops (900px and wider) always keep the square. Null until measured,
// so the client never starts loading the image it is about to drop.
function useShortHero(probeRef, enabled) {
  const canMeasure = typeof window !== "undefined" && typeof ResizeObserver !== "undefined";
  const [short, setShort] = useState(() => (canMeasure ? null : false));
  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!enabled || !probe || !canMeasure) return;
    const main = probe.parentElement;
    const measure = () => {
      const desktop = window.matchMedia?.("(min-width: 900px)").matches;
      const column = Math.min(main.clientWidth, 680);
      setShort(!desktop && probe.offsetHeight < SHORT_HERO_FIT * column);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(probe);
    ro.observe(main);
    return () => ro.disconnect();
  }, [probeRef, enabled, canMeasure]);
  return enabled ? short : false;
}

// Today's heading and centrepiece. With a poster, the poster is the star
// and already prints the categories and OR, so the title isn't repeated
// above it: the small eyebrow is the page's h1 and the puzzle's title is
// the poster's alt text, announced once. The square poster shows by
// default; on screens too short for it and the action below (see
// useShortHero), the puzzle's wide artwork shows instead, and a puzzle with
// only wide artwork shows that everywhere. Either is shown whole at its own
// shape: a 1:1 image fills the square, anything else is `contain`ed inside
// it, and the wide artwork keeps its natural proportions, never cropped or
// stretched, with nothing drawn over it. With no artwork, or artwork that
// fails to load, the visible title and the category matchup show instead
// of a broken image. `preferWide` (today's puzzle once it is finished)
// shows the wide artwork whenever the puzzle has it, on every screen; the
// square poster, then the matchup, are its fallbacks.
export function HomeHero({ game, colors, artworkUrl, wideUrl = null, eyebrow, preferWide = false, hideEyebrow = false }) {
  const [failed, setFailed] = useState(() => new Set());
  const probeRef = useRef(null);
  const square = artworkUrl && !failed.has(artworkUrl) ? artworkUrl : null;
  const wide = wideUrl && !failed.has(wideUrl) ? wideUrl : null;
  const pickByHeight = Boolean(square && wide && !preferWide);
  const short = useShortHero(probeRef, pickByHeight);
  const fail = (src) => setFailed((s) => new Set(s).add(src));
  if (!square && !wide) {
    return (
      <>
        <HomeHeading eyebrow={eyebrow} title={game.themeTitle} hideEyebrow={hideEyebrow}/>
        <HomeMatchup game={game} colors={colors}/>
      </>
    );
  }
  const alt = game.themeTitle?.trim() || `${game.categoryA} or ${game.categoryB}`;
  const useWide = Boolean(wide) && (!square || preferWide || short === true);
  const src = useWide ? wide : square;
  return (
    <>
      <div className={hideEyebrow ? undefined : "hm-heading"}>
        <h1 className={hideEyebrow ? "hm-sr-only" : "hm-eyebrow"}>{eyebrow}</h1>
      </div>
      <div className={useWide ? "hm-artwork is-wide" : "hm-artwork"}>
        {short !== null && <img key={src} src={src} alt={alt} decoding="async" onError={() => fail(src)}/>}
      </div>
      {pickByHeight && <div className="hm-art-probe" ref={probeRef} aria-hidden="true"/>}
    </>
  );
}

// The one big yellow-to-orange action.
export function HomeBigButton({ children, onClick, describedBy }) {
  return (
    <button type="button" className="hm-play" onClick={onClick} aria-describedby={describedBy}>
      <span className="hm-play-label">{children}</span>
    </button>
  );
}

function Chevron() {
  return (
    <svg className="hm-chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Smaller follow-on actions under the main one (How to Play when there is
// no puzzle today). Stats and Archive live in the shared header.
export function HomeLinks({ links }) {
  return (
    <div className="hm-links">
      {links.map((l) => (
        <button key={l.id} type="button" className={`hm-link hm-link-${l.tone}`} onClick={l.onClick}>
          {l.icon && <span className="hm-link-icon" aria-hidden="true">{l.icon}</span>}
          <span className="hm-link-label">{l.label}</span>
          {l.chevron !== false && <Chevron/>}
        </button>
      ))}
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
    </svg>
  );
}

// Today is finished: the real score, the Results copy for it, See my results
// and the existing Home Share (onShare resolves to shareResult's outcome).
// No replay from here. A puzzle link to an earlier puzzle reuses the panel
// with its own first button (`primaryLabel`, Play again).
export function HomeDonePanel({ score, total, message, onResults, onShare, primaryLabel = null }) {
  // Share feedback: "copied" flips the button label for a moment; "failed"
  // stays until the next press. Presses while a share sheet is open are ignored.
  const [shareStatus, setShareStatus] = useState(null);
  const shareBusy = useRef(false);
  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const share = async () => {
    if (shareBusy.current) return;
    shareBusy.current = true;
    clearTimeout(copiedTimer.current);
    setShareStatus(null);
    try {
      const status = shareFeedback(await onShare());
      setShareStatus(status);
      if (status === "copied") copiedTimer.current = setTimeout(() => setShareStatus(null), 2000);
    } finally { shareBusy.current = false; }
  };
  return (
    <section className="hm-done" aria-labelledby="hm-done-score">
      <div className="hm-done-score" id="hm-done-score">
        <span className="hm-done-lead">You got</span>{" "}
        <span className="hm-done-num">{score}<span className="hm-done-of">/{total}</span></span>
      </div>
      {message && <p className="hm-done-msg">{message}</p>}
      <div className="hm-done-actions">
        <button type="button" className="hm-done-btn hm-done-results" onClick={onResults}>
          {primaryLabel || <>See my results <span aria-hidden="true">{"\u{1F389}"}</span></>}
        </button>
        {/* Both labels sit in one grid cell, so the button is always sized
            for the wider one and "Copied!" moves nothing. */}
        <button type="button" className="hm-done-btn hm-done-share" onClick={share}>
          <span className="hm-share-face" data-shown={shareStatus !== "copied"}><ShareGlyph/> Share</span>
          <span className="hm-share-face" data-shown={shareStatus === "copied"}>Copied!</span>
        </button>
      </div>
      <span className="hm-sr-only" role="status">{shareStatus === "copied" ? "Result copied to clipboard" : ""}</span>
      {shareStatus === "failed" && (
        <p className="hm-share-error" role="alert">
          {primaryLabel
            ? <>Couldn&rsquo;t copy your result. Please try again.</>
            : <>Couldn&rsquo;t copy your result. Open &ldquo;See my results&rdquo; and copy the text shown there.</>}
        </p>
      )}
    </section>
  );
}

// Milliseconds until `target` (a time in ms), ticking every second and
// catching up at once when the tab comes back. It never does anything at
// zero itself: the caller shows what comes next.
function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [target]);
  return Math.max(0, target - now);
}

// Two small, still spark lines either side of the countdown in its last ten
// minutes. Decoration only.
function CountdownSparks({ flip = false }) {
  return (
    <svg className={flip ? "hm-cd-sparks is-flip" : "hm-cd-sparks"} viewBox="0 0 20 30" aria-hidden="true" focusable="false">
      <path d="M5 5l9 7M3 25l11-4" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round"/>
    </svg>
  );
}

// The next puzzle's picture: its wide artwork whole at its own shape, else
// its square poster (smaller, also whole), else its category matchup. An
// image that fails to load steps down to the next.
function UpNextArt({ game, colors, wideUrl, squareUrl }) {
  const [failed, setFailed] = useState(() => new Set());
  const fail = (src) => setFailed((s) => new Set(s).add(src));
  const alt = game.themeTitle?.trim() || `${game.categoryA} or ${game.categoryB}`;
  const src = [wideUrl, squareUrl].find((u) => u && !failed.has(u));
  if (!src) {
    return <div className="hm-next-art is-matchup"><HomeMatchup game={game} colors={colors}/></div>;
  }
  return (
    <div className={src === wideUrl ? "hm-next-art" : "hm-next-art is-square"}>
      <img key={src} src={src} alt={alt} loading="lazy" decoding="async" onError={() => fail(src)}/>
    </div>
  );
}

// Up Next, under today's finished puzzle: the label (`title`: "Up next", or
// "Tomorrow's puzzle" when it opens tomorrow), a countdown to the moment the
// next published puzzle opens (`opensAt`, ms: schedule.js releaseTime, the
// release rule everything else uses), and that puzzle's artwork, which stays
// the bigger thing. The countdown is a row of small blocks -- days first when
// the opening is more than a day away, then hours, minutes and seconds --
// fixed-width with tabular digits, so nothing shifts as it counts, and its
// colour warms up as the opening nears (countdownTier). At zero it becomes
// PLAY NOW, which only reloads the page: Home then reads the new day the
// usual way. Nothing changes on its own. Screen readers hear the time in
// words, to the minute; the ticking digits stay silent.
export function HomeUpNext({ game, colors, wideUrl, squareUrl, opensAt, title = "Up next" }) {
  const left = useCountdown(opensAt);
  const tier = countdownTier(left);
  const groups = countdownGroups(left);
  return (
    <section className="hm-next" aria-labelledby="hm-next-title">
      <h2 className="hm-next-title" id="hm-next-title">{title}</h2>
      {tier === "open" ? (
        <button type="button" className="hm-next-play" onClick={() => window.location.reload()}>
          Play now
        </button>
      ) : (
        <div className="hm-cd" data-tier={tier} role="timer" aria-label={`Opens in ${countdownWords(left)}`}>
          {tier === "soon" && <CountdownSparks/>}
          {groups.map((g) => (
            <span key={g.unit} className="hm-cd-cell" aria-hidden="true">
              <span className="hm-cd-num">{g.value}</span>
              <span className="hm-cd-unit">{g.unit}</span>
            </span>
          ))}
          {tier === "soon" && <CountdownSparks flip/>}
        </div>
      )}
      <UpNextArt game={game} colors={colors} wideUrl={wideUrl} squareUrl={squareUrl}/>
    </section>
  );
}

// The artwork slot for pages with no matchup to show (no puzzle, loading,
// error): the same outlined card, holding two of the existing wrapped
// candies. Purely decorative.
export function HomeCandyArt({ busy = false }) {
  return (
    <div className={busy ? "hm-candy-art is-busy" : "hm-candy-art"} aria-hidden="true">
      <img className="hm-candy hm-candy-a" src="/candy-turquoise.png" alt=""/>
      <span className="hm-candy-dots">
        <img src="/sprinkle-pink.png" alt=""/>
        <img src="/sprinkle-yellow.png" alt=""/>
        <img src="/sprinkle-turquoise.png" alt=""/>
      </span>
      <img className="hm-candy hm-candy-b" src="/candy-pink.png" alt=""/>
    </div>
  );
}

// The streak, leading Home. The number is the player's real streak, always;
// only its SIZE follows the day within the current 100-day lap
// (streakPrestige.js), so it collapses to small at 101, 201, ... on purpose.
// It is deliberately in normal flow, so a big one pushes the puzzle down the
// page. Prestige (completed laps) changes the look of the number and its
// DAY STREAK label together (data-theme) and adds a medal badge. `streak` is
// the player's actual streak (nothing here changes it); `flame` is the icon.
export function HomeStreak({ streak, flame }) {
  const [open, setOpen] = useState(false);
  const numRef = useRef(null);
  // Font size and horizontal squash for this screen width (null until
  // measured, so the first paint is the wide-screen size).
  const [fit, setFit] = useState(null);
  const { cycleDay, prestigeCount } = streakCycle(streak);
  useLayoutEffect(() => {
    const el = numRef.current;
    if (!el || cycleDay === 0) return;
    const measure = () => {
      const vw = document.documentElement.clientWidth;
      const px = streakFontForWidth(cycleDay, vw);
      const naturalEm = el.offsetWidth / parseFloat(getComputedStyle(el).fontSize);
      const k = streakSqueeze(px, naturalEm, Math.min(vw - 24, 960));
      setFit((f) => (f && Math.abs(f.px - px) < 0.05 && Math.abs(f.k - k) < 0.001 ? f : { px, k, w: px * naturalEm * k }));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    ro?.observe(document.documentElement);
    return () => { window.removeEventListener("resize", measure); ro?.disconnect(); };
  }, [cycleDay, streak]);
  if (cycleDay === 0) return null;
  const total = totalStreakText(streak); // "237-day total streak", for the badge
  const medals = prestigeCount <= MAX_INDIVIDUAL_MEDALS ? "\u{1F3C5}".repeat(prestigeCount) : `\u{1F3C5} × ${prestigeCount}`;
  const laps = `${prestigeCount} ${prestigeCount === 1 ? "prestige" : "prestiges"}`;
  const growth = streakGrowth(cycleDay);
  const shown = String(streakCycle(streak).actual);
  return (
    <section className="hm-sk" data-theme={prestigeTheme(prestigeCount)}
      style={{ "--sk-t": growth.toFixed(4), "--sk-px": (fit ? fit.px : streakFontForWidth(cycleDay, 1280)).toFixed(1) }}
      aria-label={`${shown}-day streak`}>
      <span className="hm-sk-flame" aria-hidden="true">{flame}</span>
      <div className="hm-sk-numbox" style={fit ? { width: fit.w } : undefined}>
        <div className="hm-sk-num" ref={numRef} style={fit && fit.k < 1 ? { transform: `scaleX(${fit.k.toFixed(4)})` } : undefined}>{shown}</div>
      </div>
      <div className="hm-sk-label">DAY STREAK</div>
      {prestigeCount > 0 && (
        <>
          <button type="button" className="hm-sk-badge" aria-expanded={open}
            aria-label={`${laps}. ${total}.`} title={total} onClick={() => setOpen((o) => !o)}>
            <span aria-hidden="true">{medals}</span>
          </button>
          {open && <p className="hm-sk-total">{total} &middot; {laps}</p>}
        </>
      )}
    </section>
  );
}

export function HomeFoot({ children }) {
  return <div className="hm-foot">{children}</div>;
}
