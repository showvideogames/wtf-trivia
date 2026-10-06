import Icon from "./Icon.jsx";
import { useStudio } from "./StudioContext.js";
import { describeAdminAccess } from "./adminAccess.js";

// ============================================================
// ADMIN ACCESS NOTICE — the Studio needs a signed-in admin account
// ============================================================
// The Studio password only opens the Studio in this tab; the server lets
// an ADMIN ACCOUNT save, publish and upload (0003_wtf_admin_gate.sql).
// variant "gate":   the whole page, shown instead of the Studio until the
//                   account is confirmed as an admin.
// variant "banner": inside the editor when the account changes mid-edit.
//                   The editor stays open with every edit kept; only the
//                   writes are paused until admin access is back.
export default function AdminAccessNotice({variant="banner", status, email, busy=false, error=null, onSignIn, onSignOut, onRetry, onLock, onExit}){
  const {BrandIcon} = useStudio();
  const {title, body, action} = describeAdminAccess(status, email);
  const checking = status==="checking";
  const actions = (
    <div className="ps-alert-actions">
      {action==="signin"&&<button type="button" className="ps-btn ps-btn-sm ps-btn-primary" onClick={onSignIn} disabled={busy} aria-busy={busy||undefined}>{busy?"Opening sign-in…":"Sign in with admin account"}</button>}
      {action==="signout"&&<button type="button" className="ps-btn ps-btn-sm ps-btn-primary" onClick={onSignOut} disabled={busy} aria-busy={busy||undefined}>{busy?"Signing out…":"Sign out of this account"}</button>}
      {action==="retry"&&<button type="button" className="ps-btn ps-btn-sm ps-btn-primary" onClick={onRetry} disabled={busy} aria-busy={busy||undefined}>{busy?"Checking…":"Try again"}</button>}
    </div>
  );
  const message = (
    <>
      <div className="ps-access-title">
        {checking?<span className="ps-spinner" aria-hidden="true"/>:<Icon name="warn" size={18}/>}
        <span>{title}</span>
      </div>
      <p className="ps-access-body">{body}</p>
      {variant==="banner"&&!checking&&<p className="ps-access-body">Your edits are still here. Saving, publishing and image uploads come back once you're signed in as an admin.</p>}
      {error&&<p className="ps-access-error" role="alert">{error}</p>}
      {action&&actions}
    </>
  );

  if(variant==="banner"){
    return <div className="ps-access is-banner" role={checking?"status":"alert"} aria-live="polite">{message}</div>;
  }
  return(
    <div className="ps-shell">
      <header className="ps-topbar">
        <div className="ps-brand">
          <BrandIcon name="gear" size={34}/>
          <span>What The Fudge Admin</span>
        </div>
        <div className="ps-topbar-actions">
          <a className="ps-btn" href="/" onClick={e=>{e.preventDefault();onExit();}}>Back to site</a>
          <button type="button" className="ps-btn" onClick={onLock}>Lock Studio</button>
        </div>
      </header>
      <main className="ps-dash">
        <section className="ps-panel ps-access is-gate" role={checking?"status":"alert"} aria-live="polite">{message}</section>
      </main>
    </div>
  );
}
