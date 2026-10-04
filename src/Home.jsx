import { useEffect, useRef, useState } from "react";
import CandyPageShell from "./CandyPageShell.jsx";
import SiteHeader from "./SiteHeader.jsx";
import CategoryArtImage from "./CategoryArtImage.jsx";
import { shareFeedback } from "./homeShare.js";

// ---- HOME ----
// The category-first Home page, built on the Archive's custard shell and
// cream site header. The daily matchup is the star, the Play button is the
// one big action, and everything else supports those two. App.jsx keeps the
// data and behaviour (start/resume, results, share, navigation); these are
// the presentational pieces, plus the loading and error pages, which reuse
// the same shell and header so the finished page doesn't jump.

// The page frame: shell, the shared header, then the centred hero column.
// `pending` (loading and error) keeps the header's geometry but makes it
// inert, since there is nothing behind its links yet.
export function HomePage({ header, pending = false, children }) {
  return (
    <CandyPageShell className="hm-page">
      <div className="hm-inner">
        {pending
          ? <div className="hm-header-pending" inert>{header}</div>
          : header}
        <main className="hm-main">{children}</main>
      </div>
    </CandyPageShell>
  );
}

// The shared SiteHeader with Home's links: Play (this page), Archive and
// How to Play, then sound, the dev-only Admin gear and the account control.
export function HomeHeader({ player, sound, onPlay, onArchive, onHelp, onAccount, admin, accountLabel }) {
  const signedIn = Boolean(player && !player.isGuest);
  return (
    <SiteHeader
      current="play"
      nav={[
        { id: "play", label: "Play", onClick: onPlay },
        { id: "archive", label: "Archive", onClick: onArchive },
        { id: "help", label: "How to Play", onClick: onHelp },
      ]}
      sound={sound}
      account={{
        signedIn,
        label: signedIn ? accountLabel : "Sign in",
        title: signedIn ? (player.email || "Account") : "Sign in",
        onClick: onAccount,
      }}
      admin={admin}
    />
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

// Today's heading and centrepiece. With a Home & Share poster, the poster is
// the star and already prints the categories and OR, so the title isn't
// repeated above it: the small eyebrow is the page's h1 and the puzzle's
// title is the poster's alt text, announced once. The poster is shown
// whole: a 1:1 image fills the square, anything else is `contain`ed inside
// it, never cropped or stretched, with nothing drawn over it. With no
// poster, or one that fails to load, the visible title and the category
// matchup show instead of a broken image.
export function HomeHero({ game, colors, artworkUrl, eyebrow }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!artworkUrl || failedSrc === artworkUrl) {
    return (
      <>
        <HomeHeading eyebrow={eyebrow} title={game.themeTitle}/>
        <HomeMatchup game={game} colors={colors}/>
      </>
    );
  }
  const alt = game.themeTitle?.trim() || `${game.categoryA} or ${game.categoryB}`;
  return (
    <>
      <div className="hm-heading">
        <h1 className="hm-eyebrow">{eyebrow}</h1>
      </div>
      <div className="hm-artwork">
        <img src={artworkUrl} alt={alt} decoding="async" onError={() => setFailedSrc(artworkUrl)}/>
      </div>
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

// Stats and Archive (or any pair of smaller follow-on actions).
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
// No replay from here.
export function HomeDonePanel({ score, total, message, onResults, onShare }) {
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
          See my results <span aria-hidden="true">{"\u{1F389}"}</span>
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
          Couldn&rsquo;t copy your result. Open &ldquo;See my results&rdquo; and copy the text shown there.
        </p>
      )}
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
