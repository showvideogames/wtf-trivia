// ---- SITE HEADER ----
// The cream navigation bar from the Archive design: page links on the left,
// the logo in the middle, the player's own controls (sound, Admin when the
// dev flag allows it, Sign in / account) on the right. On narrow screens it
// becomes two rows -- controls either side of the logo, then the links --
// rather than squeezing one row. Built to spread to other pages later; for
// now only Archive uses it.
//
//   nav:     [{id, label, onClick}] -- real destinations or actions only
//   current: id of the link for the page being shown (pink, aria-current)
//   sound:   the sound engine ({muted, setMuted}), optional
//   account: {label, title, signedIn, onClick}
//   admin:   {onClick, icon}, optional; the caller decides when it shows

export default function SiteHeader({ nav, current, sound, account, admin }) {
  return (
    <header className="sh-bar">
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
        <div className="sh-tools-start">
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
        </div>
        <div className="sh-tools-end">
          <button type="button" className={account.signedIn ? "sh-account is-signed-in" : "sh-account"}
                  onClick={account.onClick} title={account.title}>
            {account.label}
          </button>
        </div>
      </div>
    </header>
  );
}
