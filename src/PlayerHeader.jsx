import { useContext } from "react";
import SiteHeader from "./SiteHeader.jsx";
import { PlayerChromeContext } from "./playerChrome.js";

// ---- PLAYER HEADER ----
// The one header every player-facing screen shows: Home, gameplay and
// replay (question and reveal), Results, Archive, Stats, Account, loading,
// error, and the player view inside Admin Preview. It is SiteHeader in one
// fixed frame (.ph-top in site.css: the same width, gutters and top offset
// everywhere), so moving between screens never resizes or shifts the bar or
// its centred logo. Under 900px that is the compact row: menu on the left,
// logo centred, sound and account on the right. From 900px the page links
// show inline.
//
// The screen supplies everything through PlayerChromeContext
// (playerChrome.js), so no screen builds its own copy:
//   current  id of the nav link for the screen being shown, or null
//   nav      [{id, label, onClick}] (Play -- the Home page --, Archive,
//            Stats, How to Play)
//   sound    the sound engine ({muted, setMuted})
//   account  {signedIn, label, title, onClick}
//   admin    {onClick, icon} or null (the dev-only Admin entry)

// pending: loading and error, where nothing behind the links is ready yet.
// The header keeps its exact geometry but is inert.
// compact: always the phone row, whatever the window width -- for Admin
// Preview, whose stage is a phone-width screen inside a desktop window.
// sticky: every scrolling page (all but gameplay). On phones (up to 599px)
// the header becomes a full-width cream bar pinned to the top that the page
// scrolls under; from 600px it stays the floating bar and scrolls away with
// the page (site.css). Only the class changes, so the header is never
// remounted between screens. The ad slot is never part of
// the pinned frame: on sticky screens it sits just after it, in the page's
// own flow, so only the navigation stays on screen while the page scrolls.
// (The frame is always the first element, so moving the slot never
// remounts the header.)
export default function PlayerHeader({ pending = false, compact = false, sticky = false }) {
  const chrome = useContext(PlayerChromeContext);
  if (!chrome) return null;
  const header = (
    <SiteHeader current={chrome.current} nav={chrome.nav} sound={chrome.sound}
      account={chrome.account} admin={chrome.admin}/>
  );
  let frame = compact ? "ph-top ph-compact" : "ph-top";
  if (sticky) frame += " ph-sticky";
  return (
    <>
      <div className={frame}>
        {pending ? <div className="ph-pending" inert>{header}</div> : header}
        {!sticky && <AdSlot/>}
      </div>
      {sticky && <AdSlot/>}
    </>
  );
}

// The future advertisement position, directly under the header and above
// the page (the matchup banner, during a game), and outside the pinned
// frame on Home and Archive. There is no ad network yet:
// with no ad it renders nothing at all, so it takes no height. In
// development only, localStorage "wtf-dev-ad" = "show" draws the quiet
// ADVERTISEMENT placeholder for screenshots; that check sits behind
// import.meta.env.DEV, so a production build drops it entirely.
export function AdSlot({ children = null }) {
  if (children) {
    return <aside className="ad-slot" aria-label="Advertisement">{children}</aside>;
  }
  if (import.meta.env.DEV && devAdPlaceholderOn()) {
    return (
      <aside className="ad-slot ad-slot-placeholder" aria-label="Advertisement placeholder">
        <span aria-hidden="true">Advertisement</span>
      </aside>
    );
  }
  return null;
}

function devAdPlaceholderOn() {
  try { return localStorage.getItem("wtf-dev-ad") === "show"; } catch { return false; }
}
