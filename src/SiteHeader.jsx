import { useEffect, useId, useRef, useState } from "react";

import MoreGames from "./MoreGames.jsx";

// ---- SITE HEADER ----
// One cream header across all player screens. On compact widths, the menu
// holds the same page links and the logo stays centered between the controls.
// The optional Admin action is separate from player settings.
function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
    </svg>
  );
}
function PersonGlyph({ signedIn }) {
  return (
    <svg className="sh-account-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill={signedIn ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"><circle cx="12" cy="7" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7Z" /></g>
    </svg>
  );
}
function CurrentGlyph() {
  return (
    <svg className="sh-menu-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.2 8.4l3 3 6.6-6.6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// A header destination: a link when it has an address, a button otherwise
// (Admin Preview's inert stand-ins). A plain left click stays in the app
// (onClick, which moves the address itself); a modified or middle click is
// left to the browser, so "open in new tab" works.
function NavItem({ item, onClick = item.onClick, children, ...props }) {
  if (!item.href) return <button type="button" onClick={onClick} {...props}>{children}</button>;
  const follow = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onClick();
  };
  return <a href={item.href} onClick={follow} {...props}>{children}</a>;
}

// The phone menu: a disclosure (button + panel). Opening focuses the first
// link; Escape closes and returns focus to the button; a press anywhere
// outside the header closes it; choosing an item closes it and puts focus back
// on the button (so a dialog it opens can return focus there), then runs the
// item's own action.
function HeaderMenu({ items, current }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector("a, button")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus({ preventScroll: true }); }
    };
    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="sh-menu" ref={wrapRef} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" ref={buttonRef} className="sh-icon-btn sh-menu-btn"
              aria-expanded={open} aria-controls={panelId} aria-label="Menu"
              onClick={() => setOpen((o) => !o)}>
        <MenuGlyph/>
      </button>
      {open && (
        <nav className="sh-menu-panel" id={panelId} ref={panelRef} aria-label="Menu destinations">
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <NavItem item={item}
                         className={currentClass("sh-menu-item", item.id, current)}
                         aria-current={ariaCurrent(item.id, current)}
                         onClick={() => { setOpen(false); buttonRef.current?.focus({ preventScroll: true }); item.onClick(); }}>
                  {item.icon && <span className="sh-menu-icon" aria-hidden="true">{item.icon}</span>}
                  <span className="sh-menu-label">{item.label}</span>
                  {item.id === current && <CurrentGlyph/>}
                </NavItem>
              </li>
            ))}
          </ul>
          <MoreGames/>
        </nav>
      )}
    </div>
  );
}

// Marks for the current link. How to Play is a dialog, not a page: while it
// is open it takes the same pink mark as a page link (but no aria-current),
// and the page underneath gets its own mark back when it closes.
function currentClass(base, id, current) {
  return id === current ? `${base} is-current` : base;
}
function ariaCurrent(id, current) {
  return id === current && id !== "help" ? "page" : undefined;
}

function GearGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9.8 3.5h4.4l.5 2.4 1.4.8 2.3-.8 2.2 3.8-1.8 1.6v1.5l1.8 1.6-2.2 3.8-2.3-.8-1.4.8-.5 2.4H9.8l-.5-2.4-1.4-.8-2.3.8-2.2-3.8 1.8-1.6v-1.5L3.4 9.7l2.2-3.8 2.3.8 1.4-.8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function SoundGlyph({ muted }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M11 5 6 9H3v6h3l5 4z"/>
      {muted ? <path d="m15 9 5 6m0-6-5 6"/> : <path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>}
    </svg>
  );
}

function SettingsMenu({ sound }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    optionRef.current?.focus({ preventScroll: true });
    const onPointerDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  const onKeyDown = (e) => {
    if (open && e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    }
  };
  return (
    <div className="sh-settings" ref={wrapRef}
         onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
         onKeyDown={onKeyDown}>
      <button type="button" className="sh-icon-btn sh-settings-btn" ref={triggerRef}
              aria-label="Settings" title="Settings" aria-expanded={open} aria-controls={id}
              onClick={() => setOpen((value) => !value)}><GearGlyph/></button>
      {open && (
        <section className="sh-menu-panel sh-settings-panel" aria-label="Settings" id={id}>
          <h2>Settings</h2>
          <button type="button" className="sh-menu-item" role="switch" aria-checked={!sound.muted}
                  aria-label="Sound effects" ref={optionRef} onClick={() => sound.setMuted((value) => !value)}>
            <span>Sound effects</span>
            <span className="sh-sound-state" aria-hidden="true">{sound.muted ? "Off" : "On"}</span>
          </button>
        </section>
      )}
    </div>
  );
}

export default function SiteHeader({ nav, current, sound, account, admin }) {
  const pageLinks = nav.map((item) => item.id === "help" ? { ...item, label: "How To Play" } : item);
  const menuItems = admin ? [...pageLinks, { id: "admin", label: "Admin", icon: admin.icon, onClick: admin.onClick }] : pageLinks;
  const accountName = account.signedIn ? "Account" : "Sign in";
  return (
    <header className="sh-bar">
      <div className="sh-left">
        <HeaderMenu items={menuItems} current={current}/>
        <nav className="sh-nav" aria-label="Main">
          {pageLinks.map((item) => (
            <NavItem key={item.id} item={item}
                     className={currentClass("sh-link", item.id, current)}
                     aria-current={ariaCurrent(item.id, current)}>
              {item.label}
            </NavItem>
          ))}
        </nav>
      </div>
      <img src="/wtf-logo-wordmark.png" alt="What The Fudge" className="sh-logo"/>
      <div className="sh-tools">
        {sound && <>
          <button type="button" className="sh-icon-btn" onClick={() => sound.setMuted((m) => !m)}
                  aria-pressed={!sound.muted}
                  aria-label={sound.muted ? "Turn sound on" : "Turn sound off"}
                  title={sound.muted ? "Turn sound on" : "Turn sound off"}>
            <SoundGlyph muted={sound.muted}/>
          </button>
          <SettingsMenu sound={sound}/>
        </>}
        <button type="button" className={account.signedIn ? "sh-icon-btn sh-account is-signed-in" : "sh-icon-btn sh-account"}
                onClick={account.onClick} aria-label={accountName} title={accountName}>
          <PersonGlyph signedIn={account.signedIn}/>
        </button>
      </div>
    </header>
  );
}
