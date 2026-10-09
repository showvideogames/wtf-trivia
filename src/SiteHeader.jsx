import { useEffect, useId, useRef, useState } from "react";

// ---- SITE HEADER ----
// The cream navigation bar from the Archive design: page links on the left,
// the logo in the middle, the player's own controls (sound, Admin when the
// dev flag allows it, Sign in / account) on the right. Under 900px it stays
// one compact row: a menu button on the left holding the page links (and
// the dev Admin entry), the logo centred, sound and a compact account
// button on the right. Every player screen shows it, through PlayerHeader.
//
//   nav:     [{id, label, href?, onClick}] -- real destinations or actions
//            only. With an href the item is a real link (its address opens in
//            a new tab, copies, ...); a plain click runs onClick instead.
//   current: id of the link for the page being shown (pink, aria-current)
//   sound:   the sound engine ({muted, setMuted}), optional
//   account: {label, title, signedIn, onClick}
//   admin:   {onClick, icon}, optional; the caller decides when it shows

function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
    </svg>
  );
}
function PersonGlyph() {
  return (
    <svg className="sh-account-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8.2" r="4" fill="currentColor"/>
      <path d="M4.6 20.2c.7-4 3.7-6.3 7.4-6.3s6.7 2.3 7.4 6.3z" fill="currentColor"/>
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
    <div className="sh-menu" ref={wrapRef}>
      <button type="button" ref={buttonRef} className="sh-icon-btn sh-menu-btn"
              aria-expanded={open} aria-controls={panelId} aria-label="Menu"
              onClick={() => setOpen((o) => !o)}>
        <MenuGlyph/>
      </button>
      {open && (
        <nav className="sh-menu-panel" id={panelId} ref={panelRef} aria-label="Main">
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

function GridGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.4"/>
      <rect x="13" y="4" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.4"/>
      <rect x="4" y="13" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.4"/>
      <rect x="13" y="13" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.4"/>
    </svg>
  );
}

// Phone shortcuts (Archive beside the menu, ? beside sound) show only when
// both fit in their side of the bar with the logo still dead centre: the
// bar's two side tracks are equal, so each side's controls are measured
// against half of what the logo leaves. If either side would not fit, both
// stay hidden (they are always in the menu too). Nothing is shrunk to fit.
function useShortcutRoom(barRef) {
  const [room, setRoom] = useState(false);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const left = bar.querySelector(".sh-left");
      const tools = bar.querySelector(".sh-tools");
      const logo = bar.querySelector(".sh-logo");
      const menuBtn = bar.querySelector(".sh-menu-btn");
      if (!left || !menuBtn || !left.offsetWidth) { setRoom(false); return; }
      const cs = getComputedStyle(bar);
      const inner = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const side = (inner - logo.offsetWidth - 2 * parseFloat(cs.columnGap)) / 2;
      const btn = menuBtn.offsetWidth;
      const gapL = parseFloat(getComputedStyle(left).columnGap) || 0;
      const gapT = parseFloat(getComputedStyle(tools).columnGap) || 0;
      // Each side's width without its shortcut, then with one more circle.
      const base = (el, gap) => [...el.children]
        .filter((c) => !c.classList.contains("sh-shortcut") && c.offsetWidth)
        .reduce((w, c, i) => w + c.offsetWidth + (i ? gap : 0), 0);
      const needLeft = base(left, gapL) + gapL + btn;
      const needRight = base(tools, gapT) + gapT + btn;
      setRoom(needLeft <= side && needRight <= side);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    const logo = bar.querySelector(".sh-logo");
    if (logo && !logo.complete) logo.addEventListener("load", measure, { once: true });
    return () => ro.disconnect();
  }, [barRef]);
  return room;
}

export default function SiteHeader({ nav, current, sound, account, admin }) {
  const menuItems = admin ? [...nav, { id: "admin", label: "Admin", icon: admin.icon, onClick: admin.onClick }] : nav;
  const barRef = useRef(null);
  const room = useShortcutRoom(barRef);
  const archive = nav.find((item) => item.id === "archive");
  const help = nav.find((item) => item.id === "help");
  return (
    <header className="sh-bar" ref={barRef} data-shortcuts={room ? "on" : undefined}>
      <div className="sh-left">
        <HeaderMenu items={menuItems} current={current}/>
        {archive && (
          <NavItem item={archive} className={currentClass("sh-icon-btn sh-shortcut", "archive", current)}
                   aria-current={ariaCurrent("archive", current)}
                   aria-label={archive.label} title={archive.label}>
            <GridGlyph/>
          </NavItem>
        )}
      </div>
      <nav className="sh-nav" aria-label="Main">
        {nav.map((item) => (
          <NavItem key={item.id} item={item}
                   className={currentClass("sh-link", item.id, current)}
                   aria-current={ariaCurrent(item.id, current)}>
            {item.label}
          </NavItem>
        ))}
      </nav>
      {/* The approved wordmark: the logo without its TRIVIA line (the same
          artwork, cropped), on every screen and at every width. */}
      <img src="/wtf-logo-wordmark.png" alt="What The Fudge" className="sh-logo"/>
      <div className="sh-tools">
        {help && (
          <NavItem item={help} className={currentClass("sh-icon-btn sh-shortcut sh-help", "help", current)}
                   aria-label={help.label} title={help.label}>
            <span aria-hidden="true">?</span>
          </NavItem>
        )}
        {sound && (
          <button type="button" className="sh-icon-btn" onClick={() => sound.setMuted((m) => !m)}
                  aria-pressed={!sound.muted}
                  aria-label={sound.muted ? "Turn sound on" : "Turn sound off"}
                  title={sound.muted ? "Turn sound on" : "Turn sound off"}>
            <span aria-hidden="true">{sound.muted ? "\u{1F507}" : "\u{1F50A}"}</span>
          </button>
        )}
        {admin && (
          <button type="button" className="sh-icon-btn sh-admin" onClick={admin.onClick} aria-label="Admin" title="Admin">
            {admin.icon}
          </button>
        )}
        {/* On phones only the person icon shows; the label stays as the
            button's accessible name. */}
        <button type="button" className={account.signedIn ? "sh-account is-signed-in" : "sh-account"}
                onClick={account.onClick} title={account.title}>
          <PersonGlyph/>
          <span className="sh-account-label">{account.label}</span>
        </button>
      </div>
    </header>
  );
}
