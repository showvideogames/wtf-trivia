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
//            How to Play)
//   sound    the sound engine ({muted, setMuted})
//   account  {signedIn, label, title, onClick}
//   admin    {onClick, icon} or null (the dev-only Admin entry)

// pending: loading and error, where nothing behind the links is ready yet.
// The header keeps its exact geometry but is inert.
// compact: always the phone row, whatever the window width -- for Admin
// Preview, whose stage is a phone-width screen inside a desktop window.
// sticky: pinned to the top while the page scrolls (Home and Archive). Only
// the cream bar is opaque; around it the frame is transparent, so the page
// shows naturally beside and above the bar. Only the class changes, so the
// header is never remounted between screens.
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
    <div className={frame}>
      {pending ? <div className="ph-pending" inert>{header}</div> : header}
      <AdSlot/>
    </div>
  );
}

// The future advertisement position, directly under the header and above
// the page (the matchup banner, during a game). There is no ad network yet:
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
