import { useEffect, useId, useRef, useState } from "react";

// ---- SITE HEADER ----
// The cream navigation bar from the Archive design: page links on the left,
// the logo in the middle, the player's own controls (sound, Admin when the
// dev flag allows it, Sign in / account) on the right. Under 900px it stays
// one compact row: a menu button on the left holding the page links (and
// the dev Admin entry), the logo centred, sound and a compact account
// button on the right. Every player screen shows it, through PlayerHeader.
//
//   nav:     [{id, label, onClick}] -- real destinations or actions only
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

// The phone menu: a disclosure (button + panel). Opening focuses the first
// link; Escape closes and returns focus to the button; a press anywhere
// outside the header closes it; choosing an item closes it, then runs the
// item's own action.
function HeaderMenu({ items, current }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector("button")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
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
                <button type="button"
                        className={item.id === current ? "sh-menu-item is-current" : "sh-menu-item"}
                        aria-current={item.id === current ? "page" : undefined}
                        onClick={() => { setOpen(false); item.onClick(); }}>
                  {item.icon && <span className="sh-menu-icon" aria-hidden="true">{item.icon}</span>}
                  <span className="sh-menu-label">{item.label}</span>
                  {item.id === current && <CurrentGlyph/>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

export default function SiteHeader({ nav, current, sound, account, admin }) {
  const menuItems = admin ? [...nav, { id: "admin", label: "Admin", icon: admin.icon, onClick: admin.onClick }] : nav;
  return (
    <header className="sh-bar">
      <HeaderMenu items={menuItems} current={current}/>
      <nav className="sh-nav" aria-label="Main">
        {nav.map((item) => (
          <button key={item.id} type="button"
                  className={item.id === current ? "sh-link is-current" : "sh-link"}
                  aria-current={item.id === current ? "page" : undefined}
                  onClick={item.onClick}>
            {item.label}
          </button>
        ))}
      </nav>
      <img src="/wtf-logo.png" alt="What The Fudge Trivia" className="sh-logo"/>
      <div className="sh-tools">
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
