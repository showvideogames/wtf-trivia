import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CandyPageShell from "./CandyPageShell.jsx";
import CategoryArtImage from "./CategoryArtImage.jsx";
import { shareFeedback } from "./homeShare.js";
import { countdownGroups, countdownWords } from "./schedule.js";

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

export function HomeHeading({ eyebrow, title }) {
  return (
    <div className="hm-heading">
      <p className="hm-eyebrow">{eyebrow}</p>
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
// of a broken image.
export function HomeHero({ game, colors, artworkUrl, wideUrl = null, eyebrow }) {
  const [failed, setFailed] = useState(() => new Set());
  const probeRef = useRef(null);
  const square = artworkUrl && !failed.has(artworkUrl) ? artworkUrl : null;
  const wide = wideUrl && !failed.has(wideUrl) ? wideUrl : null;
  const short = useShortHero(probeRef, Boolean(square && wide));
  const fail = (src) => setFailed((s) => new Set(s).add(src));
  if (!square && !wide) {
    return (
      <>
        <HomeHeading eyebrow={eyebrow} title={game.themeTitle}/>
        <HomeMatchup game={game} colors={colors}/>
      </>
    );
  }
  const alt = game.themeTitle?.trim() || `${game.categoryA} or ${game.categoryB}`;
  const useWide = Boolean(wide) && (!square || short === true);
  const src = useWide ? wide : square;
  return (
    <>
      <div className="hm-heading">
        <h1 className="hm-eyebrow">{eyebrow}</h1>
      </div>
      <div className={useWide ? "hm-artwork is-wide" : "hm-artwork"}>
        {short !== null && <img key={src} src={src} alt={alt} decoding="async" onError={() => fail(src)}/>}
      </div>
      {square && wide && <div className="hm-art-probe" ref={probeRef} aria-hidden="true"/>}
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
// catching up at once when the tab comes back. `onDone` runs once when it
// reaches zero.
function useCountdown(target, onDone) {
  const [now, setNow] = useState(() => Date.now());
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => {
    let done = false;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (!done && t >= target) { done = true; onDoneRef.current?.(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [target]);
  return Math.max(0, target - now);
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

// Up Next, under today's action: the label, a countdown to the moment the
// next published puzzle opens (`opensAt`, ms), and that puzzle's artwork.
// Nothing else. `onOpen` runs when the countdown reaches zero, so Home can
// move on to the new day. The countdown says its time to screen readers in
// words, to the minute; the ticking digits stay silent.
export function HomeUpNext({ game, colors, wideUrl, squareUrl, opensAt, onOpen }) {
  const left = useCountdown(opensAt, onOpen);
  const groups = countdownGroups(left);
  return (
    <section className="hm-next" aria-labelledby="hm-next-title">
      <h2 className="hm-next-title" id="hm-next-title">Up next</h2>
      <div className="hm-next-clock" role="timer" aria-label={`Opens in ${countdownWords(left)}`}>
        {groups.map((g, i) => (
          <span key={g.unit} className="hm-next-group" aria-hidden="true">
            {i > 0 && !groups[i - 1].unit.startsWith("day") && <span className="hm-next-colon">:</span>}
            <span className="hm-next-cell">
              <span className="hm-next-num">{g.value}</span>
              <span className="hm-next-unit">{g.unit}</span>
            </span>
          </span>
        ))}
      </div>
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

export function HomeFoot({ children }) {
  return <div className="hm-foot">{children}</div>;
}
